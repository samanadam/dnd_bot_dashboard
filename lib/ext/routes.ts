import { z } from "zod";
import type { UserRepo } from "@/lib/access/grants";
import { campaignOf, NO_DDB_CAMPAIGN, resolveCampaign, type CampaignRef } from "@/lib/ddb/campaign";
import type { DdbLinkRepo } from "@/lib/ddb/links";
import { mapCharacter, type Mapped } from "@/lib/ddb/map";
import { matches } from "@/lib/ddb/writeBack";
import { invalidBody, readDmJson } from "@/lib/dm/guard";
import { json, noContent } from "@/lib/dm/http";
import type { AuditLog } from "@/lib/dm/http";
import type { TableRollRepo } from "@/lib/play/tableRolls";
import { RateLimiter, type Limit } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/requestGuard";
import type { RollToAnnounce } from "@/lib/sheets/routes";
import type { SheetRepo } from "@/lib/sheets/repo";
import { newVitals } from "@/lib/sheets/vitals";
import type { ExtTokenRepo } from "./tokens";

// /api/ext: what the D&D Beyond browser extension may call. Bearer token only
// (see tokens.ts); the extension sends D&D Beyond's raw character data and the
// portal reads it here, so a format change is fixed on the server.

export type ExtDeps = {
  tokens: () => ExtTokenRepo;
  links: () => DdbLinkRepo;
  sheets: () => SheetRepo;
  users: () => UserRepo;
  // The campaigns the user (by their last-seen roles) plays in, with their names; null when the bot cannot be asked.
  campaignsOf: (userId: string) => Promise<CampaignRef[] | null>;
  announce?: (roll: RollToAnnounce, userId: string) => Promise<boolean>;
  // Tells the bot which character a player is in a campaign (null clears it). False on failure.
  syncName?: (campaignId: string, userId: string, name: string | null) => Promise<boolean>;
  now?: () => number;
  limiter?: RateLimiter;
  rollLimiter?: RateLimiter;
  // The table's rolls, where relayed D&D Beyond rolls are kept with who may see them.
  tableRolls?: () => TableRollRepo;
  syncLimiter?: RateLimiter;
  badTokenLimiter?: RateLimiter;
  log?: AuditLog;
};

// A whole D&D Beyond character is already ~600 KB at level 1; deploy/Caddyfile allows the same on this path.
export const MAX_SYNC_BYTES = 4 * 1024 * 1024;
const REQUESTS: Limit = { max: 120, windowMs: 60_000 };
// Reading and mapping a whole character is the costly call: the extension syncs about 4 times a minute.
const SYNCS: Limit = { max: 20, windowMs: 60_000 };
const sharedSyncLimiter = new RateLimiter();
// Wrong tokens per client address: guessing one is hopeless, but each try still costs a lookup.
const BAD_TOKENS: Limit = { max: 30, windowMs: 60_000 };
const sharedBadTokenLimiter = new RateLimiter();
const sharedLimiter = new RateLimiter();

/** Keeps the bot's character name for this player in step with their active sheet, as the sheet routes do. */
export async function syncName(deps: Pick<ExtDeps, "sheets" | "syncName">, campaignId: string, userId: string): Promise<void> {
  if (!deps.syncName) return;
  const sheets = deps.sheets();
  const active = sheets.activeFor(campaignId, userId);
  const ok = await deps.syncName(campaignId, userId, active && active.status === "active" ? active.name : null).catch(() => false);
  if (active) sheets.setNameSync(active.id, ok ? "ok" : "pending");
}

// The maximum HP the extension shows (a synced sheet always has it set by hand).
const maxHpOf = (mapped: Mapped): number => (mapped.body.combat.hp.mode === "manual" ? mapped.body.combat.hp.max : 1);

export type Bearer = { ok: true; tokenId: string; userId: string; campaignId: string } | { ok: false; response: Response };

export function bearer(request: Request, deps: ExtDeps): Bearer {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (ptx_[A-Za-z0-9_-]{20,100})$/.exec(header);
  const found = match ? deps.tokens().verify(match[1]) : null;
  if (!found) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const wait = (deps.badTokenLimiter ?? sharedBadTokenLimiter).take(`ext-bad:${ip}`, BAD_TOKENS);
    if (wait > 0) return { ok: false, response: errorResponse(429, "rate_limited", "Too many wrong tokens. Slow down.", { "Retry-After": String(wait) }) };
    return { ok: false, response: errorResponse(401, "unauthorized", "Pair the extension again.") };
  }
  const wait = (deps.limiter ?? sharedLimiter).take(`ext:${found.id}`, REQUESTS);
  if (wait > 0) return { ok: false, response: errorResponse(429, "rate_limited", "Too many requests. Slow down.", { "Retry-After": String(wait) }) };
  return { ok: true, tokenId: found.id, userId: found.userId, campaignId: found.campaignId };
}

export function extPing(deps: ExtDeps) {
  return {
    async GET(request: Request): Promise<Response> {
      const who = bearer(request, deps);
      if (!who.ok) return who.response;
      return json({ user: deps.users().get(who.userId)?.displayName ?? "Player", campaignId: who.campaignId || null });
    },
  };
}

const liveSchema = z.object({ live: z.boolean() }).strict();

export function extLive(deps: ExtDeps) {
  return {
    /** `{ live }`: the player's switch in the extension. It reports in again every 30-60 s while on. */
    async PUT(request: Request): Promise<Response> {
      const who = bearer(request, deps);
      if (!who.ok) return who.response;
      const body = await readDmJson(request, 256);
      if (!body.ok) return body.response;
      const parsed = liveSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      deps.links().setLive(who.userId, parsed.data.live, new Date(deps.now?.() ?? Date.now()).toISOString());
      return noContent();
    },
  };
}

const syncSchema = z
  .object({
    ddbCharacterId: z.string().regex(/^\d{1,20}$/, "expected digits"),
    capturedAt: z.iso.datetime(),
    readOnly: z.boolean(),
    character: z.unknown(),
  })
  .strict();

export function extSync(deps: ExtDeps) {
  return {
    async POST(request: Request): Promise<Response> {
      const who = bearer(request, deps);
      if (!who.ok) return who.response;
      const wait = (deps.syncLimiter ?? sharedSyncLimiter).take(`ext-sync:${who.tokenId}`, SYNCS);
      if (wait > 0) return errorResponse(429, "rate_limited", "Syncing too often. Slow down.", { "Retry-After": String(wait) });
      const body = await readDmJson(request, MAX_SYNC_BYTES);
      if (!body.ok) return body.response;
      const parsed = syncSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const { ddbCharacterId, readOnly, character } = parsed.data;
      // The page says whether it may be edited, and so does the data: believe neither alone.
      const editable = (character as { data?: { canEdit?: unknown } } | null)?.data?.canEdit === true;
      // A clock that runs ahead must not freeze the sync until the real time catches up.
      const capturedAt = new Date(Math.min(Date.parse(parsed.data.capturedAt), deps.now?.() ?? Date.now())).toISOString();

      // A shared or read-only view is somebody else's character: never theirs to sync.
      if (readOnly || !editable) return errorResponse(422, "read_only", "This D&D Beyond page is read-only. Open your own character.");

      const links = deps.links();
      const sheets = deps.sheets();
      const link = links.find(who.userId, ddbCharacterId);

      // Which portal campaign: what the player chose before, the name D&D Beyond gives the
      // campaign, or the only one they play in. A token made for one campaign stays in it.
      const ddb = campaignOf(character);
      const ddbKey = ddb?.id ?? NO_DDB_CAMPAIGN;
      const playing = await deps.campaignsOf(who.userId);
      // Without the list, a character that already has a sheet keeps syncing where it is; a new one has to wait.
      if (playing === null && !link) return errorResponse(503, "bot_unavailable", "The portal cannot reach the bot right now. It will retry.");
      const candidates = who.campaignId ? (playing ?? []).filter((c) => c.id === who.campaignId) : (playing ?? []);
      const resolution = playing === null ? ({ kind: "needs", candidates: [] } as const) : resolveCampaign({ ddb, mapped: links.mappedCampaign(who.userId, ddbKey), candidates });
      if (resolution.kind === "none") return errorResponse(403, "not_in_campaign", "You no longer play in this campaign. Pair the extension again.");

      // A retried or out-of-order push must never roll a newer sheet back.
      if (link && Date.parse(capturedAt) <= Date.parse(link.capturedAt)) return json({ sheetId: link.sheetId, created: false, ignored: true, warnings: [] });

      const result = mapCharacter(character);
      if (!result.ok) {
        if (link) links.setError(link.sheetId, result.reason);
        return errorResponse(422, "unreadable", `D&D Beyond data could not be read: ${result.reason}`);
      }
      const { mapped } = result;

      // A character that already has a sheet is never asked about again: it stays where it is
      // until the player chooses another campaign.
      const current = link ? sheets.get(link.sheetId) : null;
      let campaignId: string;
      if (resolution.kind === "ok") {
        campaignId = resolution.campaignId;
        if (resolution.remember) links.mapCampaign(who.userId, ddbKey, campaignId);
      } else if (current) {
        campaignId = current.campaignId;
      } else {
        links.setPending(who.userId, ddbCharacterId, mapped.name, ddb ?? { id: NO_DDB_CAMPAIGN, name: "No D&D Beyond campaign" }, new Date(deps.now?.() ?? Date.now()).toISOString());
        return json({ error: { code: "needs_campaign", message: "Choose which campaign this character belongs to in the portal.", campaigns: resolution.candidates } }, 409);
      }

      if (link) {
        const before = sheets.get(link.sheetId);
        // Two-way HP: a change made in the portal stands until D&D Beyond holds it too.
        let vitals = mapped.vitals;
        const pending = links.writeFor(link.sheetId, deps.now?.() ?? Date.now());
        if (pending && matches(pending, mapped.vitals)) links.clearWrite(link.sheetId);
        else if (pending) vitals = { ...vitals, hp: pending.hp, tempHp: pending.tempHp, deathSaves: { successes: pending.successes, failures: pending.failures } };
        let saved = sheets.saveSynced(link.sheetId, mapped.body, vitals, mapped.edition);
        if (!saved) return errorResponse(404, "not_found", "The synced sheet is gone.");
        links.touch(link.sheetId, capturedAt);
        links.setDdbCampaign(link.sheetId, ddb);
        links.clearPending(who.userId, ddbCharacterId);
        if (saved.campaignId !== campaignId) {
          const from = saved.campaignId;
          saved = sheets.moveToCampaign(link.sheetId, campaignId) ?? saved;
          await syncName(deps, from, who.userId);
          await syncName(deps, campaignId, who.userId);
        } else if (before && before.name !== saved.name) await syncName(deps, saved.campaignId, who.userId);
        deps.log?.({ event: "play_write", userId: who.userId, method: "POST", path: "ext/sheets/sync", status: 200 });
        return json({ sheetId: saved.id, campaignId: saved.campaignId, created: false, hp: saved.vitals.hp, maxHp: maxHpOf(mapped), warnings: mapped.warnings });
      }

      const maxHp = maxHpOf(mapped);
      const created = sheets.create({
        campaignId,
        ownerUserId: who.userId,
        edition: mapped.edition,
        name: mapped.name,
        body: mapped.body,
        vitals: { ...newVitals(maxHp), ...mapped.vitals },
      });
      if (created === "limit") return errorResponse(409, "limit", "No room for another sheet. Delete one in the portal first.");
      try {
        links.create(created.id, who.userId, ddbCharacterId, capturedAt, ddb);
      } catch {
        sheets.remove(created.id);
        return errorResponse(409, "conflict", "Another sync of this character is running. Try again.");
      }
      links.clearPending(who.userId, ddbCharacterId);
      await syncName(deps, campaignId, who.userId);
      deps.log?.({ event: "play_write", userId: who.userId, method: "POST", path: "ext/sheets/sync", status: 200 });
      return json({ sheetId: created.id, campaignId, created: true, hp: created.vitals.hp, maxHp, warnings: mapped.warnings });
    },
  };
}

export function extWrites(deps: ExtDeps) {
  return {
    /** The HP changes made in the portal that this player's extension should save on D&D Beyond. */
    async GET(request: Request): Promise<Response> {
      const who = bearer(request, deps);
      if (!who.ok) return who.response;
      return json({ writes: deps.links().pendingWrites(who.userId, deps.now?.() ?? Date.now()) });
    },
  };
}

const sinceQuery = z.object({ since: z.iso.datetime() });

export function extRollsOut(deps: ExtDeps) {
  return {
    /** `?since=`: portal rolls of this player's synced characters, for the extension to show in D&D Beyond's game log. */
    async GET(request: Request): Promise<Response> {
      const who = bearer(request, deps);
      if (!who.ok) return who.response;
      const parsed = sinceQuery.safeParse({ since: new URL(request.url).searchParams.get("since") ?? "" });
      if (!parsed.success) return invalidBody(parsed.error.issues);
      return json({ rolls: deps.tableRolls?.().outgoing(who.userId, parsed.data.since, deps.now?.() ?? Date.now()) ?? [] });
    },
  };
}

const locationQuery = z.object({ ddbCharacterId: z.string().regex(/^[0-9]{1,20}$/, "expected digits") });

export function extSheetLocation(deps: ExtDeps) {
  return {
    /**
     * `?ddbCharacterId=`: the portal sheet of a D&D Beyond character, so the extension opens it
     * directly. Only the asker's own, or one in a campaign the asker plays in (as on the party pages).
     */
    async GET(request: Request): Promise<Response> {
      const who = bearer(request, deps);
      if (!who.ok) return who.response;
      const parsed = locationQuery.safeParse({ ddbCharacterId: new URL(request.url).searchParams.get("ddbCharacterId") ?? "" });
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const sheets = deps.sheets();
      const found = deps
        .links()
        .byDdbCharacter(parsed.data.ddbCharacterId)
        .map((link) => ({ link, sheet: sheets.get(link.sheetId) }))
        .filter((row) => row.sheet !== null);
      const own = found.find((row) => row.link.userId === who.userId);
      let hit = own;
      if (!hit) {
        const playing = await deps.campaignsOf(who.userId);
        const ids = new Set((playing ?? []).map((c) => c.id));
        hit = found.find((row) => ids.has(row.sheet!.campaignId));
      }
      if (!hit) return errorResponse(404, "not_found", "No sheet of that character in your campaigns.");
      return json({ campaignId: hit.sheet!.campaignId, sheetId: hit.sheet!.id });
    },
  };
}

const ROLLS: Limit = { max: 30, windowMs: 60_000 };
const sharedRollLimiter = new RateLimiter();

const rollSchema = z
  .object({
    ddbCharacterId: z.string().regex(/^\d{1,20}$/, "expected digits"),
    label: z.string().trim().min(1).max(80),
    expression: z.string().trim().min(1).max(100),
    total: z.number().int().min(-10_000).max(100_000),
    breakdown: z.string().max(200),
    // Who the roll was for on D&D Beyond; an older extension sends none (a roll to the game).
    visibility: z.enum(["everyone", "dm", "self"]).default("everyone"),
  })
  .strict();

export function extRolls(deps: ExtDeps) {
  return {
    /** A finished D&D Beyond roll of a synced character, relayed to the bot's roll feed. */
    async POST(request: Request): Promise<Response> {
      const who = bearer(request, deps);
      if (!who.ok) return who.response;
      const wait = (deps.rollLimiter ?? sharedRollLimiter).take(`ext-roll:${who.tokenId}`, ROLLS);
      if (wait > 0) return errorResponse(429, "rate_limited", "Too many rolls. Slow down.", { "Retry-After": String(wait) });
      const body = await readDmJson(request, 4 * 1024);
      if (!body.ok) return body.response;
      const parsed = rollSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const { ddbCharacterId, label, expression, total, breakdown, visibility } = parsed.data;
      const link = deps.links().find(who.userId, ddbCharacterId);
      if (!link) return errorResponse(404, "not_found", "That character is not synced.");
      // A roll the player kept to themselves on D&D Beyond goes nowhere.
      if (visibility === "self") return noContent();
      const sheet = deps.sheets().get(link.sheetId);
      if (sheet) deps.tableRolls?.().add({ campaignId: sheet.campaignId, userId: who.userId, sheetId: sheet.id, who: sheet.name, label, expression, total, breakdown, visibility, source: "ddb" });
      // Discord's dice channel is public: only rolls to everyone go there.
      if (visibility === "everyone") await deps.announce?.({ expression, total, breakdown, label }, who.userId);
      deps.log?.({ event: "play_write", userId: who.userId, method: "POST", path: `ext/rolls (${visibility})`, status: 204 });
      return noContent();
    },
  };
}
