import { z } from "zod";
import type { UserRepo } from "@/lib/access/grants";
import type { DdbLinkRepo } from "@/lib/ddb/links";
import { mapCharacter } from "@/lib/ddb/map";
import { invalidBody, readDmJson } from "@/lib/dm/guard";
import { json, noContent } from "@/lib/dm/http";
import type { AuditLog } from "@/lib/dm/http";
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
  // Whether the user (by their last-seen roles) still plays in the campaign the token was made for.
  playsIn: (userId: string, campaignId: string) => Promise<boolean>;
  announce?: (roll: RollToAnnounce, userId: string) => Promise<boolean>;
  limiter?: RateLimiter;
  rollLimiter?: RateLimiter;
  log?: AuditLog;
};

export const MAX_SYNC_BYTES = 1024 * 1024;
const REQUESTS: Limit = { max: 120, windowMs: 60_000 };
const sharedLimiter = new RateLimiter();

export type Bearer = { ok: true; tokenId: string; userId: string; campaignId: string } | { ok: false; response: Response };

export function bearer(request: Request, deps: ExtDeps): Bearer {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (ptx_[A-Za-z0-9_-]{20,100})$/.exec(header);
  const found = match ? deps.tokens().verify(match[1]) : null;
  if (!found) return { ok: false, response: errorResponse(401, "unauthorized", "Pair the extension again.") };
  const wait = (deps.limiter ?? sharedLimiter).take(`ext:${found.id}`, REQUESTS);
  if (wait > 0) return { ok: false, response: errorResponse(429, "rate_limited", "Too many requests. Slow down.", { "Retry-After": String(wait) }) };
  return { ok: true, tokenId: found.id, userId: found.userId, campaignId: found.campaignId };
}

export function extPing(deps: ExtDeps) {
  return {
    async GET(request: Request): Promise<Response> {
      const who = bearer(request, deps);
      if (!who.ok) return who.response;
      return json({ user: deps.users().get(who.userId)?.displayName ?? "Player", campaignId: who.campaignId });
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
      const body = await readDmJson(request, MAX_SYNC_BYTES);
      if (!body.ok) return body.response;
      const parsed = syncSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const { ddbCharacterId, capturedAt, readOnly, character } = parsed.data;

      // A shared or read-only view is somebody else's character: never theirs to sync.
      if (readOnly) return errorResponse(422, "read_only", "This D&D Beyond page is read-only. Open your own character.");
      if (!(await deps.playsIn(who.userId, who.campaignId))) return errorResponse(403, "not_in_campaign", "You no longer play in this campaign. Pair the extension again.");

      const links = deps.links();
      const sheets = deps.sheets();
      const link = links.find(who.userId, ddbCharacterId);
      // A retried or out-of-order push must never roll a newer sheet back.
      if (link && Date.parse(capturedAt) <= Date.parse(link.capturedAt)) return json({ sheetId: link.sheetId, created: false, ignored: true, warnings: [] });

      const result = mapCharacter(character);
      if (!result.ok) {
        if (link) links.setError(link.sheetId, result.reason);
        return errorResponse(422, "unreadable", `D&D Beyond data could not be read: ${result.reason}`);
      }
      const { mapped } = result;

      if (link) {
        const saved = sheets.saveSynced(link.sheetId, mapped.body, mapped.vitals, mapped.edition);
        if (!saved) return errorResponse(404, "not_found", "The synced sheet is gone.");
        links.touch(link.sheetId, capturedAt);
        deps.log?.({ event: "play_write", userId: who.userId, method: "POST", path: "ext/sheets/sync", status: 200 });
        return json({ sheetId: saved.id, created: false, warnings: mapped.warnings });
      }

      const maxHp = mapped.body.combat.hp.mode === "manual" ? mapped.body.combat.hp.max : 1;
      const created = sheets.create({
        campaignId: who.campaignId,
        ownerUserId: who.userId,
        edition: mapped.edition,
        name: mapped.name,
        body: mapped.body,
        vitals: { ...newVitals(maxHp), ...mapped.vitals },
      });
      if (created === "limit") return errorResponse(409, "limit", "No room for another sheet. Delete one in the portal first.");
      try {
        links.create(created.id, who.userId, ddbCharacterId, capturedAt);
      } catch {
        sheets.remove(created.id);
        return errorResponse(409, "conflict", "Another sync of this character is running. Try again.");
      }
      deps.log?.({ event: "play_write", userId: who.userId, method: "POST", path: "ext/sheets/sync", status: 200 });
      return json({ sheetId: created.id, created: true, warnings: mapped.warnings });
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
      const { ddbCharacterId, label, expression, total, breakdown } = parsed.data;
      if (!deps.links().find(who.userId, ddbCharacterId)) return errorResponse(404, "not_found", "That character is not synced.");
      await deps.announce?.({ expression, total, breakdown, label }, who.userId);
      return noContent();
    },
  };
}
