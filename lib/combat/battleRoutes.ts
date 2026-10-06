import { createHash } from "node:crypto";
import type { UserRepo } from "@/lib/access/grants";
import { can, type Access } from "@/lib/access/permissions";
import { CAMPAIGN_ID } from "@/lib/campaign/selection";
import { secureRng, type Rng } from "@/lib/dice/random";
import { rollDice, withAdvantage } from "@/lib/dice/roll";
import type { Encounter } from "@/lib/dm/encounter";
import { ENCOUNTER_ID, type EncounterRepo, type StoredEncounter } from "@/lib/dm/encounters";
import { guardApi, guardDm, invalidBody, readDmJson, type DmGuardDeps } from "@/lib/dm/guard";
import { json, noContent, type AuditLog } from "@/lib/dm/http";
import { errorResponse } from "@/lib/requestGuard";
import { canManage } from "@/lib/sheets/access";
import { derive } from "@/lib/sheets/derive";
import type { SheetRepo } from "@/lib/sheets/repo";
import { z } from "zod";
import { playerLabels, toPlayerView, type BattleNote, type LinkedState } from "./battleView";
import { campaignSettingsSchema, NOTE_ID, noteInputSchema, noteUpdateSchema, type BattleInitiativeRepo, type CampaignSettingsRepo, type NoteRepo, type StoredNote } from "./store";

// /api/play/battles: the battle the DM shows to players, as players may see it.
// A player reaches a battle only when it is filed under a campaign they play in
// (or manage sheets for), is a live encounter, and the DM has turned on "Show
// to players". Everything else answers 404, like a battle that does not exist.

export type BattleRouteDeps = DmGuardDeps & {
  encounters: () => EncounterRepo;
  sheets: () => SheetRepo;
  notes: () => NoteRepo;
  battleRolls: () => BattleInitiativeRepo;
  users: () => UserRepo;
  settings?: () => CampaignSettingsRepo;
  channels?: () => Promise<{ id: string; name: string; category: string | null }[] | null>;
  rng?: Rng;
  log?: AuditLog;
};

const missing = () => errorResponse(404, "not_found", "No such battle.");
const seesCampaign = (access: Access, campaignId: string) => can(access, "play", campaignId) || canManage(access, campaignId);

/** The live state of every character sheet in the fight. */
export function linkedStates(encounter: Encounter, sheets: SheetRepo): Map<string, LinkedState & { vitalsVersion: number; initiativeBonus: number; name: string }> {
  const out = new Map<string, LinkedState & { vitalsVersion: number; initiativeBonus: number; name: string }>();
  for (const c of encounter.combatants) {
    if (c.ref?.source !== "character" || out.has(c.ref.id)) continue;
    const sheet = sheets.get(c.ref.id);
    if (!sheet) continue;
    const derived = derive(sheet.body, sheet.vitals, sheet.edition);
    out.set(sheet.id, {
      hp: sheet.vitals.hp,
      tempHp: sheet.vitals.tempHp,
      maxHp: derived.maxHp,
      conditions: sheet.vitals.conditions,
      concentration: sheet.vitals.concentration?.name ?? null,
      deathSaves: sheet.vitals.deathSaves,
      ownerUserId: sheet.ownerUserId,
      hasPortrait: sheet.portrait !== null,
      vitalsVersion: sheet.vitalsVersion,
      initiativeBonus: derived.initiative.bonus,
      name: sheet.name,
    });
  }
  return out;
}

/** A battle the caller may watch, or null. */
function watchable(deps: BattleRouteDeps, access: Access, id: string): StoredEncounter | null {
  const stored = ENCOUNTER_ID.test(id) ? deps.encounters().get(id) : null;
  if (!stored || stored.kind !== "live" || !stored.campaignId || !stored.encounter.shownToPlayers) return null;
  return seesCampaign(access, stored.campaignId) ? stored : null;
}

function noteView(deps: BattleRouteDeps, note: StoredNote, viewerUserId: string): BattleNote {
  return {
    id: note.id,
    targetKey: note.combatantId,
    targetLabel: note.targetLabel,
    text: note.text,
    visibility: note.visibility,
    keep: note.keep,
    mine: note.authorUserId === viewerUserId,
    author: deps.users().get(note.authorUserId)?.displayName ?? "A player",
    updatedAt: note.updatedAt,
  };
}

export function battleList(deps: BattleRouteDeps) {
  return {
    /** ?campaign=: the battles shown to players there. Usually none or one. */
    async GET(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "signed-in");
      if (!guard.ok) return guard.response;
      const campaignId = new URL(request.url).searchParams.get("campaign") ?? "";
      if (!CAMPAIGN_ID.test(campaignId)) return errorResponse(400, "bad_request", "Invalid campaign.");
      if (!seesCampaign(guard.access, campaignId)) return missing();
      const repo = deps.encounters();
      const shown = repo
        .list(campaignId)
        .map((summary) => repo.get(summary.id))
        .filter((stored): stored is StoredEncounter => stored !== null && stored.kind === "live" && Boolean(stored.encounter.shownToPlayers))
        .map((stored) => ({ id: stored.id, name: stored.encounter.name, round: stored.encounter.round }));
      return json(shown);
    },
  };
}

export function battleItem(deps: BattleRouteDeps) {
  return {
    /** The battle as this player may see it. Answers 304 while nothing they could see has changed. */
    async GET(request: Request, id: string): Promise<Response> {
      const guard = await guardApi(request, deps, "signed-in");
      if (!guard.ok) return guard.response;
      const stored = watchable(deps, guard.access, id);
      if (!stored) return missing();
      const linked = linkedStates(stored.encounter, deps.sheets());
      const notes = deps.notes();
      const etag = `W/"${createHash("sha256")
        .update([stored.version, ...[...linked.entries()].map(([sheetId, s]) => `${sheetId}:${s.vitalsVersion}`), notes.stamp(id), guard.userId].join("|"))
        .digest("hex")
        .slice(0, 32)}"`;
      if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "no-store" } });
      const view = toPlayerView(
        stored,
        linked,
        guard.userId,
        notes.forEncounter(id, guard.userId).map((note) => noteView(deps, note, guard.userId)),
      );
      return Response.json(view, { headers: { ETag: etag, "Cache-Control": "no-store" } });
    },
  };
}

const initiativeSchema = z.object({ mode: z.enum(["normal", "advantage", "disadvantage"]).default("normal") }).strict();

export function battleInitiative(deps: BattleRouteDeps) {
  return {
    /** The server rolls d20 + the viewer's sheet initiative and leaves it for the DM to apply. */
    async POST(request: Request, id: string): Promise<Response> {
      const guard = await guardApi(request, deps, "signed-in");
      if (!guard.ok) return guard.response;
      const stored = watchable(deps, guard.access, id);
      if (!stored) return missing();
      const body = await readDmJson(request, 1024);
      if (!body.ok) return body.response;
      const parsed = initiativeSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const linked = linkedStates(stored.encounter, deps.sheets());
      const mine = stored.encounter.combatants.find((c) => c.ref?.source === "character" && linked.get(c.ref.id)?.ownerUserId === guard.userId && !c.hidden);
      if (!mine || mine.ref?.source !== "character") return errorResponse(409, "conflict", "You have no character in this battle.");
      if (mine.initiative !== null) return errorResponse(409, "conflict", "Your initiative is already set.");
      const bonus = linked.get(mine.ref.id)!.initiativeBonus;
      const expression = `1d20${bonus >= 0 ? `+${bonus}` : bonus}`;
      const mode = parsed.data.mode;
      const roll = rollDice(mode === "normal" ? expression : withAdvantage(expression, mode === "advantage" ? "adv" : "dis"), deps.rng ?? secureRng);
      deps.battleRolls().put(id, mine.ref.id, Math.max(-20, Math.min(60, roll.total)), roll.breakdown);
      deps.log?.({ event: "play_write", userId: guard.userId, method: "POST", path: "play/battles/:id/initiative", status: 200 });
      return json({ total: roll.total, breakdown: roll.breakdown });
    },
  };
}

export function battleNotes(deps: BattleRouteDeps) {
  return {
    async GET(request: Request, id: string): Promise<Response> {
      const guard = await guardApi(request, deps, "signed-in");
      if (!guard.ok) return guard.response;
      const stored = watchable(deps, guard.access, id);
      if (!stored) return missing();
      return json(deps.notes().forEncounter(id, guard.userId).map((note) => noteView(deps, note, guard.userId)));
    },

    /** `{ combatantId, text, visibility, keep }` on a combatant the player can see. */
    async POST(request: Request, id: string): Promise<Response> {
      const guard = await guardApi(request, deps, "signed-in");
      if (!guard.ok) return guard.response;
      const stored = watchable(deps, guard.access, id);
      if (!stored || !can(guard.access, "play", stored.campaignId!)) return missing();
      const body = await readDmJson(request, 8 * 1024);
      if (!body.ok) return body.response;
      const parsed = noteInputSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      // The label the author sees now; kept with the note, so a later reveal changes nothing.
      const label = playerLabels(stored.encounter).get(parsed.data.combatantId);
      if (!label) return errorResponse(404, "not_found", "No such combatant.");
      const created = deps.notes().create({
        ...parsed.data,
        campaignId: stored.campaignId!,
        encounterId: id,
        encounterName: stored.encounter.name,
        targetLabel: label,
        authorUserId: guard.userId,
      });
      if (!created) return errorResponse(409, "conflict", "That is a lot of notes for one fight. Delete some first.");
      deps.log?.({ event: "play_write", userId: guard.userId, method: "POST", path: "play/battles/:id/notes", status: 201 });
      return json(noteView(deps, created, guard.userId), 201);
    },
  };
}

export function noteItem(deps: BattleRouteDeps) {
  async function mine(request: Request, noteId: string) {
    const guard = await guardApi(request, deps, "signed-in");
    if (!guard.ok) return { ok: false as const, response: guard.response };
    const note = NOTE_ID.test(noteId) ? deps.notes().get(noteId) : null;
    if (!note || note.authorUserId !== guard.userId || !can(guard.access, "play", note.campaignId)) return { ok: false as const, response: errorResponse(404, "not_found", "No such note.") };
    return { ok: true as const, guard, note };
  }
  return {
    async PUT(request: Request, noteId: string): Promise<Response> {
      const found = await mine(request, noteId);
      if (!found.ok) return found.response;
      const body = await readDmJson(request, 8 * 1024);
      if (!body.ok) return body.response;
      const parsed = noteUpdateSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const updated = deps.notes().update(noteId, parsed.data)!;
      return json(noteView(deps, updated, found.guard.userId));
    },

    async DELETE(request: Request, noteId: string): Promise<Response> {
      const found = await mine(request, noteId);
      if (!found.ok) return found.response;
      deps.notes().remove(noteId);
      return noContent();
    },
  };
}

export function keptNotes(deps: BattleRouteDeps) {
  return {
    /** ?campaign=: kept notes there, the viewer's own and the party's. */
    async GET(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "signed-in");
      if (!guard.ok) return guard.response;
      const campaignId = new URL(request.url).searchParams.get("campaign") ?? "";
      if (!CAMPAIGN_ID.test(campaignId)) return errorResponse(400, "bad_request", "Invalid campaign.");
      if (!can(guard.access, "play", campaignId)) return missing();
      return json(deps.notes().keptInCampaign(campaignId, guard.userId).map((note) => ({ ...noteView(deps, note, guard.userId), encounterName: note.encounterName })));
    },
  };
}

// --- the DM's side --------------------------------------------------------------

export function dmEncounterNotes(deps: BattleRouteDeps) {
  return {
    /** Every player note on an encounter: the DM reads them all, edits none. */
    async GET(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const stored = ENCOUNTER_ID.test(id) ? deps.encounters().get(id) : null;
      if (!stored || !guard.scope.allows(stored.campaignId)) return missing();
      return json(deps.notes().forEncounter(id, null).map((note) => noteView(deps, note, guard.userId)));
    },
  };
}

export function dmBattleRolls(deps: BattleRouteDeps) {
  return {
    /** Initiative players rolled on the battle page, waiting for the DM. */
    async GET(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const stored = ENCOUNTER_ID.test(id) ? deps.encounters().get(id) : null;
      if (!stored || !guard.scope.allows(stored.campaignId)) return missing();
      return json(deps.battleRolls().list(id));
    },

    /** ?character=<sheet id>: dismiss one; without it, all. */
    async DELETE(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const stored = ENCOUNTER_ID.test(id) ? deps.encounters().get(id) : null;
      if (!stored || !guard.scope.allows(stored.campaignId)) return missing();
      const character = new URL(request.url).searchParams.get("character");
      if (character !== null && !/^[0-9a-f-]{36}$/.test(character)) return errorResponse(400, "bad_request", "Invalid character.");
      deps.battleRolls().remove(id, character ?? undefined);
      return noContent();
    },
  };
}

export function campaignSettings(deps: BattleRouteDeps) {
  async function allowed(request: Request, campaignId: string) {
    const guard = await guardDm(request, deps);
    if (!guard.ok) return { ok: false as const, response: guard.response };
    if (!CAMPAIGN_ID.test(campaignId) || !guard.scope.allows(campaignId)) return { ok: false as const, response: missing() };
    return { ok: true as const, guard };
  }
  return {
    /** The campaign's turn-ping settings, and the text channels the bot can post in. */
    async GET(request: Request, campaignId: string): Promise<Response> {
      const found = await allowed(request, campaignId);
      if (!found.ok) return found.response;
      return json({ settings: deps.settings!().get(campaignId), channels: (await deps.channels?.()) ?? null });
    },

    async PUT(request: Request, campaignId: string): Promise<Response> {
      const found = await allowed(request, campaignId);
      if (!found.ok) return found.response;
      const body = await readDmJson(request, 2 * 1024);
      if (!body.ok) return body.response;
      const parsed = campaignSettingsSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      if (parsed.data.turnPing.enabled && !parsed.data.turnPing.channelId) return errorResponse(400, "bad_request", "Pick the channel to ping in.");
      if (parsed.data.turnPing.channelId) {
        const channels = await deps.channels?.();
        if (!channels) return errorResponse(503, "bot_unreachable", "The bot must be online to check the channel.");
        if (!channels.some((c) => c.id === parsed.data.turnPing.channelId)) return errorResponse(400, "bad_request", "The bot cannot post in that channel.");
      }
      const saved = deps.settings!().put(campaignId, parsed.data);
      deps.log?.({ event: "dm_write", userId: found.guard.userId, method: "PUT", path: "dm/campaigns/:id/settings", status: 200 });
      return json({ settings: saved });
    },
  };
}
