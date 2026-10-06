import { z } from "zod";
import type { UserRepo } from "@/lib/access/grants";
import { can } from "@/lib/access/permissions";
import { CAMPAIGN_ID, campaignIdSchema } from "@/lib/campaign/selection";
import { secureRng, type Rng } from "@/lib/dice/random";
import { DiceError, naturalD20, rollDice, withAdvantage } from "@/lib/dice/roll";
import type { CreatureRef } from "@/lib/dm/encounter";
import type { FeatRepo } from "@/lib/dm/feats";
import { guardApi, invalidBody, readDmJson, type DmGuardDeps, type Guarded } from "@/lib/dm/guard";
import { json, noContent, type AuditLog } from "@/lib/dm/http";
import type { SrdFeats, SrdSpells } from "@/lib/dm/spellRoutes";
import { featRow, parseFeatQuery, parseSpellQuery, searchFeats, searchSpells, spellRow, srdFeatRow, srdSpellRow } from "@/lib/dm/spellSearch";
import type { SpellRepo } from "@/lib/dm/spells";
import { RateLimiter } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/requestGuard";
import { canEdit, canManage, sheetView, summaryOf, type SheetSummary } from "./access";
import { MAX_BODY_BYTES, sheetBodySchema } from "./body";
import { derive } from "./derive";
import { opBatchSchema, type SpellFacts } from "./ops";
import type { SheetRepo, StoredSheet } from "./repo";
import { SHEET_ID } from "./repo";
import { newVitals } from "./vitals";

// /api/sheets: character sheets for their players and the people who manage
// them. Every handler starts at the guard (signed in, same origin, rate limit),
// then loads the sheet and checks the caller against its campaign. Anything the
// caller may not see answers 404, the same as a sheet that does not exist.

export type RollToAnnounce = { expression: string; total: number; breakdown: string; label: string };

export type SheetRouteDeps = DmGuardDeps & {
  sheets: () => SheetRepo;
  users: () => UserRepo;
  spells: () => SpellRepo;
  feats: () => FeatRepo;
  srdSpells: () => SrdSpells;
  srdFeats: () => SrdFeats;
  // Campaign ids the bot knows; null when it cannot be asked.
  campaignIds: () => Promise<Set<string> | null>;
  // Tells the bot which character a player is in a campaign (null clears it). False on failure.
  syncName?: (campaignId: string, userId: string, name: string | null) => Promise<boolean>;
  announce?: (roll: RollToAnnounce, userId: string) => Promise<boolean>;
  // Whether a signed-in user (by their last-seen roles) plays in a campaign: who may be given a sheet.
  playsIn?: (userId: string, roleIds: string[], campaignId: string) => boolean;
  // Deletes a portrait file once its sheet is gone.
  removePortrait?: (name: string) => void;
  rng?: Rng;
  rollLimiter?: RateLimiter;
  log?: AuditLog;
};

const missing = () => errorResponse(404, "not_found", "No such sheet.");
const SMALL_BODY = 16 * 1024;
const sharedRollLimiter = new RateLimiter();

function audit(deps: SheetRouteDeps, guard: Guarded, method: string, path: string, status: number) {
  deps.log?.({ event: "play_write", userId: guard.userId, method, path, status });
}

function ownerName(deps: SheetRouteDeps, sheet: StoredSheet): string | null {
  return sheet.ownerUserId ? (deps.users().get(sheet.ownerUserId)?.displayName ?? null) : null;
}

function summary(deps: SheetRouteDeps, sheet: StoredSheet, userId: string): SheetSummary {
  return summaryOf(sheet, userId, ownerName(deps, sheet));
}

/** Loads a sheet the caller may edit, or answers 404. */
async function editable(request: Request, deps: SheetRouteDeps, id: string): Promise<{ guard: Guarded; sheet: StoredSheet } | Response> {
  const guard = await guardApi(request, deps, "signed-in");
  if (!guard.ok) return guard.response;
  const sheet = SHEET_ID.test(id) ? deps.sheets().get(id) : null;
  if (!sheet || !canEdit(guard.access, sheet)) return missing();
  return { guard, sheet };
}

/** Keeps the bot's character name for this player in step with their active sheet. */
async function syncName(deps: SheetRouteDeps, campaignId: string, userId: string | null, trigger: string) {
  if (!userId || !deps.syncName) return;
  const active = deps.sheets().activeFor(campaignId, userId);
  const ok = await deps.syncName(campaignId, userId, active && active.status === "active" ? active.name : null).catch(() => false);
  deps.sheets().setNameSync(active?.id ?? trigger, ok ? "ok" : "pending");
}

/** Facts a cast needs, for spells the sheet may use: SRD, or custom ones of its campaign. */
function spellFacts(deps: SheetRouteDeps, sheet: StoredSheet) {
  return (ref: CreatureRef): SpellFacts | null => {
    const block = ref.source === "srd" ? deps.srdSpells().get(ref.edition, ref.slug) : deps.spells().get(ref.id);
    if (!block) return null;
    if (ref.source === "custom" && (block as { campaignId?: string | null }).campaignId !== sheet.campaignId) return null;
    return { name: block.name, level: block.level, concentration: block.concentration, ritual: block.ritual };
  };
}

const createSchema = z
  .object({
    campaignId: campaignIdSchema,
    name: z.string().trim().min(1).max(120),
    edition: z.enum(["2014", "2024"]).default("2024"),
    ownerUserId: z.string().regex(/^\d{17,20}$/).nullable().optional(),
  })
  .strict();
const saveSchema = z.object({ version: z.number().int().min(1), body: sheetBodySchema, edition: z.enum(["2014", "2024"]).optional() }).strict();
const metaSchema = z
  .object({
    ownerUserId: z.string().regex(/^\d{17,20}$/).nullable().optional(),
    active: z.boolean().optional(),
    status: z.enum(["active", "retired", "dead"]).optional(),
    dmNotes: z.string().max(20_000).optional(),
  })
  .strict();
const rollSchema = z
  .object({
    expression: z.string().trim().min(1).max(60),
    label: z.string().trim().min(1).max(60),
    mode: z.enum(["normal", "advantage", "disadvantage"]).default("normal"),
    announce: z.boolean().default(false),
  })
  .strict();
const copySchema = z.object({ campaignId: campaignIdSchema }).strict();

export function sheetCollection(deps: SheetRouteDeps) {
  return {
    /** ?campaign=<id>: the caller's own sheets there, or all of them for a manager. */
    async GET(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "signed-in");
      if (!guard.ok) return guard.response;
      const campaignId = new URL(request.url).searchParams.get("campaign") ?? "";
      if (!CAMPAIGN_ID.test(campaignId)) return errorResponse(400, "bad_request", "Invalid campaign.");
      const manager = canManage(guard.access, campaignId);
      if (!manager && !can(guard.access, "play", campaignId)) return missing();
      const sheets = deps.sheets().list(campaignId, manager ? undefined : guard.userId);
      return json(sheets.map((sheet) => summary(deps, sheet, guard.userId)));
    },

    async POST(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "signed-in");
      if (!guard.ok) return guard.response;
      const body = await readDmJson(request, SMALL_BODY);
      if (!body.ok) return body.response;
      const parsed = createSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const { campaignId, name, edition } = parsed.data;
      const manager = canManage(guard.access, campaignId);
      if (!manager && !can(guard.access, "play", campaignId)) return missing();
      // A player always owns what they make. A manager may name a player who plays here, or nobody yet.
      let ownerUserId: string | null = guard.userId;
      if (manager && parsed.data.ownerUserId !== undefined) {
        ownerUserId = parsed.data.ownerUserId;
        if (ownerUserId && !deps.users().get(ownerUserId)) return errorResponse(400, "bad_request", "That player has not signed in to the portal yet.");
      }
      const known = await deps.campaignIds();
      if (!known) return errorResponse(503, "bot_unreachable", "The campaign list is unavailable. Try again in a moment.");
      if (!known.has(campaignId)) return missing();
      const created = deps.sheets().create({ campaignId, ownerUserId, edition, name });
      if (created === "limit") return errorResponse(409, "conflict", "That is the most sheets you can keep here. Retire or delete one first.");
      audit(deps, guard, "POST", "sheets", 201);
      await syncName(deps, campaignId, ownerUserId, created.id);
      const fresh = deps.sheets().get(created.id)!;
      return json(sheetView(fresh, guard.access, ownerName(deps, fresh)), 201);
    },
  };
}

export function sheetItem(deps: SheetRouteDeps) {
  return {
    async GET(request: Request, id: string): Promise<Response> {
      const found = await editable(request, deps, id);
      if (found instanceof Response) return found;
      return json(sheetView(found.sheet, found.guard.access, ownerName(deps, found.sheet)));
    },

    /** `{ version, body, edition? }`: 409 with the current sheet when another save got there first. */
    async PUT(request: Request, id: string): Promise<Response> {
      const found = await editable(request, deps, id);
      if (found instanceof Response) return found;
      const body = await readDmJson(request, MAX_BODY_BYTES);
      if (!body.ok) return body.response;
      const parsed = saveSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const result = deps.sheets().saveBody(id, parsed.data.version, parsed.data.body, parsed.data.edition);
      if (result === null) return missing();
      if (result === "conflict") {
        const current = deps.sheets().get(id)!;
        return Response.json(
          { error: { code: "conflict", message: "This sheet was changed somewhere else." }, current: sheetView(current, found.guard.access, ownerName(deps, current)) },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }
      audit(deps, found.guard, "PUT", "sheets/:id", 200);
      if (result.name !== found.sheet.name && result.active) await syncName(deps, result.campaignId, result.ownerUserId, id);
      return json(sheetView(result, found.guard.access, ownerName(deps, result)));
    },

    async DELETE(request: Request, id: string): Promise<Response> {
      const found = await editable(request, deps, id);
      if (found instanceof Response) return found;
      if (!canManage(found.guard.access, found.sheet.campaignId)) return missing();
      if (!deps.sheets().remove(id)) return missing();
      if (found.sheet.portrait) deps.removePortrait?.(found.sheet.portrait);
      audit(deps, found.guard, "DELETE", "sheets/:id", 204);
      await syncName(deps, found.sheet.campaignId, found.sheet.ownerUserId, id);
      return noContent();
    },
  };
}

export function sheetVitals(deps: SheetRouteDeps) {
  return {
    /** ?since=N answers 304 while nothing changed: idle polling stays cheap. */
    async GET(request: Request, id: string): Promise<Response> {
      const found = await editable(request, deps, id);
      if (found instanceof Response) return found;
      const since = Number.parseInt(new URL(request.url).searchParams.get("since") ?? "", 10);
      if (Number.isFinite(since) && since >= found.sheet.vitalsVersion) return new Response(null, { status: 304, headers: { "Cache-Control": "no-store" } });
      return json({ vitalsVersion: found.sheet.vitalsVersion, vitals: found.sheet.vitals, version: found.sheet.version });
    },
  };
}

export function sheetOps(deps: SheetRouteDeps) {
  return {
    /** `{ ops: [...] }` applied together, or not at all (422 with the reason). */
    async POST(request: Request, id: string): Promise<Response> {
      const found = await editable(request, deps, id);
      if (found instanceof Response) return found;
      const body = await readDmJson(request, SMALL_BODY);
      if (!body.ok) return body.response;
      const parsed = opBatchSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const outcome = deps.sheets().applyOps(id, parsed.data.ops, (sheet) => ({
        body: sheet.body,
        edition: sheet.edition,
        rng: deps.rng ?? secureRng,
        spell: spellFacts(deps, sheet),
      }));
      if (outcome === null) return missing();
      if (!outcome.ok) return errorResponse(422, "refused", outcome.reason);
      audit(deps, found.guard, "POST", "sheets/:id/ops", 200);
      return json({ vitalsVersion: outcome.sheet.vitalsVersion, vitals: outcome.sheet.vitals, results: outcome.results });
    },
  };
}

export function sheetMeta(deps: SheetRouteDeps) {
  return {
    /** Managers: owner, active, status, DM notes. Owners: retire or bring back their own sheet. */
    async PATCH(request: Request, id: string): Promise<Response> {
      const found = await editable(request, deps, id);
      if (found instanceof Response) return found;
      const body = await readDmJson(request, 32 * 1024);
      if (!body.ok) return body.response;
      const parsed = metaSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const manager = canManage(found.guard.access, found.sheet.campaignId);
      const patch = parsed.data;
      if (!manager) {
        const onlyStatus = Object.keys(patch).every((key) => key === "status") && (patch.status === "active" || patch.status === "retired");
        if (!onlyStatus) return errorResponse(403, "forbidden", "Only the DM can change that.");
      }
      if (patch.ownerUserId) {
        const user = deps.users().get(patch.ownerUserId);
        if (!user) return errorResponse(400, "bad_request", "That player has not signed in to the portal yet.");
      }
      const updated = deps.sheets().setMeta(id, patch);
      if (!updated) return missing();
      audit(deps, found.guard, "PATCH", "sheets/:id/meta", 200);
      const before = found.sheet.ownerUserId;
      await syncName(deps, updated.campaignId, updated.ownerUserId, id);
      if (before && before !== updated.ownerUserId) await syncName(deps, updated.campaignId, before, id);
      const fresh = deps.sheets().get(id)!;
      return json(sheetView(fresh, found.guard.access, ownerName(deps, fresh)));
    },
  };
}

export function sheetNameSync(deps: SheetRouteDeps) {
  return {
    async POST(request: Request, id: string): Promise<Response> {
      const found = await editable(request, deps, id);
      if (found instanceof Response) return found;
      if (!canManage(found.guard.access, found.sheet.campaignId)) return missing();
      await syncName(deps, found.sheet.campaignId, found.sheet.ownerUserId, id);
      return json({ nameSync: deps.sheets().get(id)?.nameSync ?? "pending" });
    },
  };
}

export function sheetRoll(deps: SheetRouteDeps) {
  return {
    /** The server rolls: a player can show the table a result, never type one in. */
    async POST(request: Request, id: string): Promise<Response> {
      const found = await editable(request, deps, id);
      if (found instanceof Response) return found;
      const body = await readDmJson(request, 4 * 1024);
      if (!body.ok) return body.response;
      const parsed = rollSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const { expression, label, mode, announce } = parsed.data;
      let roll;
      try {
        roll = rollDice(mode === "normal" ? expression : withAdvantage(expression, mode === "advantage" ? "adv" : "dis"), deps.rng ?? secureRng);
      } catch (error) {
        if (error instanceof DiceError) return errorResponse(400, "bad_request", error.message);
        throw error;
      }
      const shownLabel = `${label}${mode === "normal" ? "" : ` (${mode})`}`;
      let announced = false;
      if (announce && deps.announce) {
        const wait = (deps.rollLimiter ?? sharedRollLimiter).take(`${found.guard.userId}:roll`, { max: 10, windowMs: 60_000 });
        if (wait > 0) return errorResponse(429, "rate_limited", "That is a lot of rolls for the channel. Wait a moment.", { "Retry-After": String(wait) });
        announced = await deps
          .announce({ expression: roll.expression, total: roll.total, breakdown: roll.breakdown.slice(0, 300), label: `${found.sheet.name} · ${shownLabel}`.slice(0, 80) }, found.guard.userId)
          .catch(() => false);
      }
      return json({ expression: roll.expression, total: roll.total, breakdown: roll.breakdown, label: shownLabel, announced, natural: naturalD20(roll) });
    },
  };
}

export function sheetCopy(deps: SheetRouteDeps) {
  return {
    /** `{ campaignId }`: an independent copy for another campaign, with fresh vitals. */
    async POST(request: Request, id: string): Promise<Response> {
      const found = await editable(request, deps, id);
      if (found instanceof Response) return found;
      const body = await readDmJson(request, SMALL_BODY);
      if (!body.ok) return body.response;
      const parsed = copySchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const target = parsed.data.campaignId;
      if (!canManage(found.guard.access, target) && !can(found.guard.access, "play", target)) return missing();
      const known = await deps.campaignIds();
      if (!known) return errorResponse(503, "bot_unreachable", "The campaign list is unavailable. Try again in a moment.");
      if (!known.has(target)) return missing();
      const owner = canManage(found.guard.access, target) ? found.sheet.ownerUserId : found.guard.userId;
      const sheet = found.sheet;
      // Custom spells and feats belong to one campaign; the copy keeps only SRD ones.
      const body2 = structuredClone(sheet.body);
      if (target !== sheet.campaignId) {
        body2.spellcasting.entries = body2.spellcasting.entries.filter((e) => e.ref.source === "srd");
        body2.feats = body2.feats.map((f) => (f.ref?.source === "custom" ? { ...f, ref: null } : f));
      }
      const created = deps.sheets().create({
        campaignId: target,
        ownerUserId: owner,
        edition: sheet.edition,
        name: sheet.name,
        body: body2,
        vitals: newVitals(derive(body2, newVitals(1), sheet.edition).maxHp),
      });
      if (created === "limit") return errorResponse(409, "conflict", "That is the most sheets you can keep there.");
      audit(deps, found.guard, "POST", "sheets/:id/copy", 201);
      await syncName(deps, target, owner, created.id);
      return json(sheetView(deps.sheets().get(created.id)!, found.guard.access, ownerName(deps, created)), 201);
    },
  };
}

/** Which spells and feats a sheet may pick: SRD of its edition, its campaign's shared ones, the caller's homebrew. */
function visibleCustom<T extends { campaignId: string | null; authorUserId: string | null; shared: boolean }>(rows: T[], sheet: StoredSheet, userId: string, manager: boolean): T[] {
  return rows.filter((row) => row.campaignId === sheet.campaignId && (row.shared || row.authorUserId === userId || manager));
}

export function sheetSpellSearch(deps: SheetRouteDeps) {
  return {
    async GET(request: Request, id: string): Promise<Response> {
      const found = await editable(request, deps, id);
      if (found instanceof Response) return found;
      const query = parseSpellQuery(new URL(request.url).searchParams);
      if (!query.ok) return errorResponse(400, "bad_request", query.message);
      const { sheet, guard } = found;
      const manager = canManage(guard.access, sheet.campaignId);
      const custom = visibleCustom(deps.spells().list(sheet.campaignId), sheet, guard.userId, manager).map(spellRow);
      const srd = deps.srdSpells().list().filter((s) => s.edition === sheet.edition).map(srdSpellRow);
      return json(searchSpells([...custom, ...srd], query.query.source === sheet.edition || query.query.source === "custom" ? query.query : { ...query.query, source: "all" }));
    },
  };
}

export function sheetFeatSearch(deps: SheetRouteDeps) {
  return {
    async GET(request: Request, id: string): Promise<Response> {
      const found = await editable(request, deps, id);
      if (found instanceof Response) return found;
      const query = parseFeatQuery(new URL(request.url).searchParams);
      if (!query.ok) return errorResponse(400, "bad_request", query.message);
      const { sheet, guard } = found;
      const manager = canManage(guard.access, sheet.campaignId);
      const custom = visibleCustom(deps.feats().list(sheet.campaignId), sheet, guard.userId, manager).map(featRow);
      const srd = deps.srdFeats().list().filter((f) => f.edition === sheet.edition).map(srdFeatRow);
      return json(searchFeats([...custom, ...srd], query.query.source === sheet.edition || query.query.source === "custom" ? query.query : { ...query.query, source: "all" }));
    },
  };
}

const refList = (value: string | null) =>
  (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 200);

function parseRef(text: string): CreatureRef | null {
  const srd = /^srd:(2014|2024)\/([a-z0-9-]{1,80})$/.exec(text);
  if (srd) return { source: "srd", edition: srd[1] as "2014" | "2024", slug: srd[2] };
  const custom = /^custom:([0-9a-f-]{36})$/.exec(text);
  return custom ? { source: "custom", id: custom[1] } : null;
}

export function sheetResolve(deps: SheetRouteDeps) {
  return {
    /** ?spells=srd:2024/fireball,custom:<id>&feats=...: full blocks for what the sheet lists, in one call. */
    async GET(request: Request, id: string): Promise<Response> {
      const found = await editable(request, deps, id);
      if (found instanceof Response) return found;
      const { sheet, guard } = found;
      const manager = canManage(guard.access, sheet.campaignId);
      const params = new URL(request.url).searchParams;
      const spells: Record<string, unknown> = {};
      for (const key of refList(params.get("spells"))) {
        const ref = parseRef(key);
        if (!ref) continue;
        if (ref.source === "srd") spells[key] = deps.srdSpells().get(ref.edition, ref.slug);
        else {
          const row = deps.spells().get(ref.id);
          spells[key] = row && visibleCustom([row], sheet, guard.userId, manager).length ? row : null;
        }
      }
      const feats: Record<string, unknown> = {};
      for (const key of refList(params.get("feats"))) {
        const ref = parseRef(key);
        if (!ref) continue;
        if (ref.source === "srd") feats[key] = deps.srdFeats().get(ref.edition, ref.slug);
        else {
          const row = deps.feats().get(ref.id);
          feats[key] = row && visibleCustom([row], sheet, guard.userId, manager).length ? row : null;
        }
      }
      return json({ spells, feats });
    },
  };
}

export function sheetPlayers(deps: SheetRouteDeps) {
  return {
    /** ?campaign=: who a manager may give a sheet to: signed-in users with `play` there. */
    async GET(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "signed-in");
      if (!guard.ok) return guard.response;
      const campaignId = new URL(request.url).searchParams.get("campaign") ?? "";
      if (!CAMPAIGN_ID.test(campaignId)) return errorResponse(400, "bad_request", "Invalid campaign.");
      if (!canManage(guard.access, campaignId)) return missing();
      const players = deps
        .users()
        .list()
        .filter((user) => deps.playsIn?.(user.userId, user.roleIds, campaignId) ?? false)
        .map((user) => ({ userId: user.userId, name: user.displayName }));
      return json(players);
    },
  };
}

export type LinkedVitals = {
  vitalsVersion: number;
  version: number;
  name: string;
  ownerUserId: string | null;
  hp: number;
  tempHp: number;
  maxHp: number;
  ac: number;
  initiativeBonus: number;
  conditions: StoredSheet["vitals"]["conditions"];
  concentration: string | null;
  deathSaves: StoredSheet["vitals"]["deathSaves"];
};

export function sheetVitalsBatch(deps: SheetRouteDeps) {
  return {
    /** ?ids=a,b: live numbers for the sheets in a fight, for whoever manages them (the DM's tracker). */
    async GET(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "signed-in");
      if (!guard.ok) return guard.response;
      const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").filter((id) => SHEET_ID.test(id)).slice(0, 60);
      const out: Record<string, LinkedVitals> = {};
      for (const id of ids) {
        const sheet = deps.sheets().get(id);
        if (!sheet || !canManage(guard.access, sheet.campaignId)) continue;
        const derived = derive(sheet.body, sheet.vitals, sheet.edition);
        out[id] = {
          vitalsVersion: sheet.vitalsVersion,
          version: sheet.version,
          name: sheet.name,
          ownerUserId: sheet.ownerUserId,
          hp: sheet.vitals.hp,
          tempHp: sheet.vitals.tempHp,
          maxHp: derived.maxHp,
          ac: derived.ac.value,
          initiativeBonus: derived.initiative.bonus,
          conditions: sheet.vitals.conditions,
          concentration: sheet.vitals.concentration?.name ?? null,
          deathSaves: sheet.vitals.deathSaves,
        };
      }
      return json(out);
    },
  };
}
