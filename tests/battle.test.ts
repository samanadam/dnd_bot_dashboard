import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserRepo } from "@/lib/access/grants";
import { resolveAccess, type Grant } from "@/lib/access/permissions";
import { battleInitiative, battleItem, battleList, battleNotes, campaignSettings, dmEncounterNotes, keptNotes, linkedStates, noteItem } from "@/lib/combat/battleRoutes";
import { healthBand, toPlayerView } from "@/lib/combat/battleView";
import { resetPingThrottle, sideEffects } from "@/lib/combat/sideEffects";
import { BattleInitiativeRepo, CampaignSettingsRepo, NoteRepo } from "@/lib/combat/store";
import { openDatabase } from "@/lib/dm/db";
import { addCombatant, type Encounter, type NewCombatant } from "@/lib/dm/encounter";
import { EncounterRepo } from "@/lib/dm/encounters";
import { RateLimiter } from "@/lib/rateLimit";
import { SheetRepo } from "@/lib/sheets/repo";

const OWNER = "100000000000000001";
const ARIA = "100000000000000002";
const BRAM = "100000000000000003";
const CORA = "100000000000000004"; // plays in another campaign
const EMBER = "aaaaaaaaaaaa";
const FROST = "bbbbbbbbbbbb";
const R_EMBER = "200000000000000001";
const R_FROST = "200000000000000002";
const GRANTS: Grant[] = [
  { roleId: R_EMBER, permissions: ["play"], scope: [EMBER] },
  { roleId: R_FROST, permissions: ["play"], scope: [FROST] },
];
const ROLES: Record<string, string[]> = { [ARIA]: [R_EMBER], [BRAM]: [R_EMBER], [CORA]: [R_FROST] };

const monster = (over: Partial<NewCombatant>): NewCombatant => ({
  name: "Goblin",
  kind: "monster",
  ref: { source: "srd", edition: "2024", slug: "goblin-warrior" },
  initiative: 12,
  initiativeBonus: 2,
  ac: 15,
  hp: 7,
  maxHp: 7,
  tempHp: 0,
  conditions: [],
  concentration: false,
  friendly: false,
  notes: "",
  ...over,
});

let n = 0;
const newId = () => `c${++n}`;

function setup() {
  const db = openDatabase(":memory:");
  const users = new UserRepo(db);
  users.upsert(ARIA, "Aria's player", null, [R_EMBER]);
  users.upsert(BRAM, "Bram's player", null, [R_EMBER]);
  const sheets = new SheetRepo(db);
  const aria = sheets.create({ campaignId: EMBER, ownerUserId: ARIA, edition: "2024", name: "Aria" });
  const bram = sheets.create({ campaignId: EMBER, ownerUserId: BRAM, edition: "2024", name: "Bram" });
  if (aria === "limit" || bram === "limit") throw new Error("limit");
  const encounters = new EncounterRepo(db);
  const stored = encounters.create("Ambush at the ford", EMBER, "live");
  let enc: Encounter = { ...stored.encounter };
  enc = addCombatant(enc, monster({ name: "SECRET-BOSS-NAME", alias: "Hooded figure", ac: 19, hp: 40, maxHp: 90, notes: "SECRET-DM-NOTE", conditions: [{ name: "Poisoned", rounds: 3 }], concentration: true }), newId);
  enc = addCombatant(enc, monster({ name: "Goblin Archer", ac: 13, hp: 6, maxHp: 7 }), newId);
  enc = addCombatant(enc, monster({ name: "HIDDEN-AMBUSHER", hidden: true, ac: 17, hp: 30, maxHp: 30 }), newId);
  enc = addCombatant(enc, monster({ name: "Veyra", kind: "npc", friendly: true, ref: null, ac: 16, hp: 20, maxHp: 30 }), newId);
  enc = addCombatant(enc, { ...monster({}), name: "Aria", kind: "player", ref: { source: "character", id: aria.id }, ac: 0, hp: 1, maxHp: 1, initiative: null }, newId);
  enc = addCombatant(enc, { ...monster({}), name: "Bram", kind: "player", ref: { source: "character", id: bram.id }, ac: 0, hp: 1, maxHp: 1, initiative: 9 }, newId);
  enc = { ...enc, round: 2, turn: 0, shownToPlayers: true };
  const saved = encounters.save(stored.id, stored.version, enc);
  if (!saved || saved === "conflict") throw new Error("save");
  let as: string | null = ARIA;
  const deps = {
    getAccess: async () => (as ? resolveAccess(as, ROLES[as] ?? [], [OWNER], GRANTS) : null),
    limiter: new RateLimiter(),
    encounters: () => encounters,
    sheets: () => sheets,
    notes: () => new NoteRepo(db),
    battleRolls: () => new BattleInitiativeRepo(db),
    users: () => users,
    settings: () => new CampaignSettingsRepo(db),
    channels: async () => [{ id: "300000000000000001", name: "table", category: null }],
    rng: () => 10,
  };
  return { db, deps, sheets, encounters, battle: saved, aria, bram, act: (user: string | null) => (as = user) };
}

const req = (method = "GET", body?: unknown, headers: Record<string, string> = {}, query = "") =>
  new Request(`https://portal.example/api/play/battles${query}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "x-portal-request": "1", "sec-fetch-site": "same-origin", ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
  });

beforeEach(() => resetPingThrottle());

describe("health bands", () => {
  it("cut at the thirds", () => {
    expect(healthBand(90, 90)).toBe("max");
    expect(healthBand(61, 90)).toBe("max");
    expect(healthBand(60, 90)).toBe("mid"); // exactly two thirds
    expect(healthBand(30, 90)).toBe("mid"); // exactly one third
    expect(healthBand(29, 90)).toBe("low");
    expect(healthBand(1, 90)).toBe("low");
    expect(healthBand(0, 90)).toBe("down");
  });
});

describe("what a player sees of a battle", () => {
  it("contains nothing the DM keeps from players", async () => {
    const { deps, battle } = setup();
    const response = await battleItem(deps).GET(req(), battle.id);
    expect(response.status).toBe(200);
    const text = await response.text();
    for (const forbidden of ["SECRET-BOSS-NAME", "SECRET-DM-NOTE", "HIDDEN-AMBUSHER", "goblin-warrior", '"ac"', '"maxHp":90', '"hp":40', '"rounds"', '"ref"', '"kind"', '"alias"', '"hidden"', '"playerNumber"', '"concentration":true', BRAM, ARIA]) {
      expect(text, forbidden).not.toContain(forbidden);
    }
    const view = JSON.parse(text);
    // Only allowlisted keys, at every level.
    expect(Object.keys(view).sort()).toEqual(["entries", "id", "me", "name", "notes", "round", "turn"]);
    for (const entry of view.entries) expect(Object.keys(entry).sort()).toEqual(["band", "conditions", "initiative", "key", "label", "portrait", "side", "you"]);
  });

  it("labels enemies by alias or number, shows the party by name, and hides the hidden", async () => {
    const { deps, battle } = setup();
    const view = await (await battleItem(deps).GET(req(), battle.id)).json();
    const labels = view.entries.map((e: { label: string }) => e.label);
    expect(labels).toEqual(["Hooded figure", "Enemy 2", "Veyra", "Aria", "Bram"]);
    expect(view.entries.map((e: { side: string }) => e.side)).toEqual(["enemy", "enemy", "party", "party", "party"]);
    expect(view.entries[0]).toMatchObject({ band: "mid", conditions: ["Poisoned"], initiative: null });
  });

  it("gives exact numbers only for the viewer's own character", async () => {
    const { deps, battle, aria, sheets } = setup();
    sheets.applyOps(aria.id, [{ op: "damage", amount: 3 }], (s) => ({ body: s.body, edition: s.edition, rng: () => 1, spell: () => null }));
    const view = await (await battleItem(deps).GET(req(), battle.id)).json();
    const live = sheets.get(aria.id)!;
    expect(view.me).toMatchObject({ characterId: aria.id, name: "Aria", hp: live.vitals.hp, needsInitiative: true });
    expect(view.entries.find((e: { you: boolean }) => e.you).label).toBe("Aria");
    expect(view.entries.find((e: { label: string }) => e.label === "Bram").initiative).toBeNull();
  });

  it("reports a hidden combatant's turn without naming it", async () => {
    const { deps, battle, encounters } = setup();
    const hiddenIndex = battle.encounter.combatants.findIndex((c) => c.hidden);
    encounters.save(battle.id, battle.version, { ...battle.encounter, turn: hiddenIndex });
    const view = await (await battleItem(deps).GET(req(), battle.id)).json();
    expect(view.turn).toEqual({ hidden: true });
  });

  it("answers 304 while nothing visible changed, and a fresh view after a sheet changes", async () => {
    const { deps, battle, aria, sheets } = setup();
    const first = await battleItem(deps).GET(req(), battle.id);
    const etag = first.headers.get("etag")!;
    expect((await battleItem(deps).GET(req("GET", undefined, { "if-none-match": etag }), battle.id)).status).toBe(304);
    sheets.applyOps(aria.id, [{ op: "damage", amount: 1 }], (s) => ({ body: s.body, edition: s.edition, rng: () => 1, spell: () => null }));
    expect((await battleItem(deps).GET(req("GET", undefined, { "if-none-match": etag }), battle.id)).status).toBe(200);
  });
});

describe("who may watch", () => {
  it("refuses another campaign's player, anonymous callers, and battles not shown", async () => {
    const { deps, battle, encounters, act } = setup();
    act(CORA);
    expect((await battleItem(deps).GET(req(), battle.id)).status).toBe(404);
    expect((await battleList(deps).GET(req("GET", undefined, {}, `?campaign=${EMBER}`))).status).toBe(404);
    act(null);
    expect((await battleItem(deps).GET(req(), battle.id)).status).toBe(401);
    act(ARIA);
    encounters.save(battle.id, battle.version, { ...battle.encounter, shownToPlayers: false });
    expect((await battleItem(deps).GET(req(), battle.id)).status).toBe(404);
    expect(await (await battleList(deps).GET(req("GET", undefined, {}, `?campaign=${EMBER}`))).json()).toEqual([]);
  });

  it("never shows a prepared or unfiled encounter, even when marked shown", async () => {
    const { deps, encounters } = setup();
    const prepared = encounters.create("Template", EMBER, "prepared");
    encounters.save(prepared.id, prepared.version, { ...prepared.encounter, shownToPlayers: true });
    const unfiled = encounters.create("Loose", null, "live");
    encounters.save(unfiled.id, unfiled.version, { ...unfiled.encounter, shownToPlayers: true });
    expect((await battleItem(deps).GET(req(), prepared.id)).status).toBe(404);
    expect((await battleItem(deps).GET(req(), unfiled.id)).status).toBe(404);
  });
});

describe("notes", () => {
  it("keeps private notes to the author and the DM, and party notes to the party", async () => {
    const { deps, battle, act } = setup();
    const target = battle.encounter.combatants[0].id;
    await battleNotes(deps).POST(req("POST", { combatantId: target, text: "Resists fire", visibility: "private", keep: true }), battle.id);
    await battleNotes(deps).POST(req("POST", { combatantId: target, text: "Has a red cloak", visibility: "party", keep: false }), battle.id);
    act(BRAM);
    const bramSees = (await (await battleNotes(deps).GET(req(), battle.id)).json()) as Array<{ text: string; targetLabel: string }>;
    expect(bramSees.map((n) => n.text)).toEqual(["Has a red cloak"]);
    expect(bramSees[0].targetLabel).toBe("Hooded figure");
    act(OWNER);
    const dmSees = (await (await dmEncounterNotes(deps).GET(req(), battle.id)).json()) as unknown[];
    expect(dmSees).toHaveLength(2);
  });

  it("only lets the author change a note, and refuses notes on hidden combatants", async () => {
    const { deps, battle, act } = setup();
    const hidden = battle.encounter.combatants.find((c) => c.hidden)!.id;
    expect((await battleNotes(deps).POST(req("POST", { combatantId: hidden, text: "x", visibility: "private", keep: false }), battle.id)).status).toBe(404);
    const created = (await (await battleNotes(deps).POST(req("POST", { combatantId: battle.encounter.combatants[1].id, text: "Archer", visibility: "party", keep: true }), battle.id)).json()) as { id: string };
    act(BRAM);
    expect((await noteItem(deps).PUT(req("PUT", { text: "Mine now" }), created.id)).status).toBe(404);
    expect((await noteItem(deps).DELETE(req("DELETE"), created.id)).status).toBe(404);
    act(ARIA);
    expect((await noteItem(deps).PUT(req("PUT", { visibility: "private" }), created.id)).status).toBe(200);
  });

  it("keeps a kept note's label after the DM reveals the name, and drops fight-only notes when the battle ends", async () => {
    const { deps, battle, encounters, sheets, db } = setup();
    const boss = battle.encounter.combatants[0].id;
    await battleNotes(deps).POST(req("POST", { combatantId: boss, text: "Kept", visibility: "private", keep: true }), battle.id);
    await battleNotes(deps).POST(req("POST", { combatantId: boss, text: "Gone", visibility: "private", keep: false }), battle.id);
    const revealed = { ...battle.encounter, combatants: battle.encounter.combatants.map((c) => (c.id === boss ? { ...c, revealed: true } : c)) };
    const after = encounters.save(battle.id, battle.version, revealed);
    if (!after || after === "conflict") throw new Error("save");
    const effects = sideEffects({ sheets: () => sheets, notes: () => new NoteRepo(db), battleRolls: () => new BattleInitiativeRepo(db), settings: () => new CampaignSettingsRepo(db), pushRoster: vi.fn(async () => {}), clearRoster: vi.fn(async () => {}), pingTurn: vi.fn(async () => {}) });
    const ended = encounters.save(battle.id, after.version, { ...revealed, round: 0, turn: 0 });
    if (!ended || ended === "conflict") throw new Error("save");
    await effects.afterSave(after, ended);
    const kept = (await (await keptNotes(deps).GET(req("GET", undefined, {}, `?campaign=${EMBER}`))).json()) as Array<{ text: string; targetLabel: string }>;
    expect(kept).toEqual([expect.objectContaining({ text: "Kept", targetLabel: "Hooded figure" })]);
  });
});

describe("initiative from the battle page", () => {
  it("rolls d20 + the sheet's bonus once, for the viewer's own character only", async () => {
    const { deps, battle, act, db } = setup();
    const response = await battleInitiative(deps).POST(req("POST", { mode: "normal" }), battle.id);
    expect(response.status).toBe(200);
    expect(new BattleInitiativeRepo(db).list(battle.id)).toHaveLength(1);
    act(BRAM);
    // Bram's initiative is already in the encounter.
    expect((await battleInitiative(deps).POST(req("POST", {}), battle.id)).status).toBe(409);
    act(CORA);
    expect((await battleInitiative(deps).POST(req("POST", {}), battle.id)).status).toBe(404);
  });
});

describe("what a save sets off", () => {
  function effects(setupResult: ReturnType<typeof setup>, now = { t: 0 }) {
    const pushRoster = vi.fn(async () => {});
    const clearRoster = vi.fn(async () => {});
    const pingTurn = vi.fn(async () => {});
    const { db, sheets } = setupResult;
    const run = sideEffects({ sheets: () => sheets, notes: () => new NoteRepo(db), battleRolls: () => new BattleInitiativeRepo(db), settings: () => new CampaignSettingsRepo(db), pushRoster, clearRoster, pingTurn, now: () => now.t });
    return { run, pushRoster, clearRoster, pingTurn, now };
  }

  it("pushes the roster when the battle is shown and clears it when hidden", async () => {
    const s = setup();
    const { run, pushRoster, clearRoster } = effects(s);
    const hidden = { ...s.battle, encounter: { ...s.battle.encounter, shownToPlayers: false } };
    await run.afterSave(hidden, s.battle);
    expect(pushRoster).toHaveBeenCalledWith(EMBER, [
      { user_id: ARIA, label: "Aria", bonus: 0 },
      { user_id: BRAM, label: "Bram", bonus: 0 },
    ]);
    await run.afterSave(s.battle, hidden);
    expect(clearRoster).toHaveBeenCalled();
  });

  it("pings the player whose turn starts, when on, once, and never for the hidden or enemies", async () => {
    const s = setup();
    new CampaignSettingsRepo(s.db).put(EMBER, { turnPing: { enabled: true, channelId: "300000000000000001" } });
    const { run, pingTurn, now } = effects(s);
    const at = (turn: number, round = 2) => ({ ...s.battle, encounter: { ...s.battle.encounter, turn, round } });
    const ariaTurn = s.battle.encounter.combatants.findIndex((c) => c.name === "Aria");
    await run.afterSave(at(0), at(1)); // an enemy
    expect(pingTurn).not.toHaveBeenCalled();
    await run.afterSave(at(ariaTurn - 1), at(ariaTurn));
    expect(pingTurn).toHaveBeenCalledWith({ channel_id: "300000000000000001", user_id: ARIA, character_name: "Aria", encounter_name: "Ambush at the ford", round: 2 });
    await run.afterSave(at(ariaTurn), at(ariaTurn)); // nothing moved
    now.t += 1000;
    await run.afterSave(at(ariaTurn + 1), at(ariaTurn + 1 + 0)); // still throttled for a different turn too soon
    expect(pingTurn).toHaveBeenCalledTimes(1);
    new CampaignSettingsRepo(s.db).put(EMBER, { turnPing: { enabled: false, channelId: null } });
    now.t += 10_000;
    await run.afterSave(at(ariaTurn), at(ariaTurn + 1));
    expect(pingTurn).toHaveBeenCalledTimes(1);
  });
});

describe("campaign settings", () => {
  it("needs a channel the bot can post in", async () => {
    const { deps, act } = setup();
    act(OWNER);
    const put = (body: unknown) => campaignSettings(deps).PUT(req("PUT", body), EMBER);
    expect((await put({ turnPing: { enabled: true, channelId: null } })).status).toBe(400);
    expect((await put({ turnPing: { enabled: true, channelId: "399999999999999999" } })).status).toBe(400);
    expect((await put({ turnPing: { enabled: true, channelId: "300000000000000001" } })).status).toBe(200);
    act(ARIA);
    expect((await campaignSettings(deps).GET(req(), EMBER)).status).toBe(404);
  });
});

describe("sheets from another campaign", () => {
  it("are never read into a battle, even when an encounter names one", async () => {
    const { deps, battle, encounters, sheets } = setup();
    const foreign = sheets.create({ campaignId: FROST, ownerUserId: CORA, edition: "2024", name: "SECRET-FROST-HERO" });
    if (foreign === "limit") throw new Error("limit");
    const crafted = addCombatant(battle.encounter, { ...monster({}), name: "Stranger", kind: "player", ref: { source: "character", id: foreign.id }, hp: 5, maxHp: 10 }, newId);
    encounters.save(battle.id, battle.version, crafted);
    const linked = linkedStates(encounters.get(battle.id)!.encounter, sheets, EMBER);
    expect(linked.has(foreign.id)).toBe(false);
    const text = await (await battleItem(deps).GET(req(), battle.id)).text();
    expect(text).not.toContain("SECRET-FROST-HERO");
    expect(text).not.toContain(foreign.id);
  });

  it("never get a turn ping", async () => {
    const s = setup();
    const foreign = s.sheets.create({ campaignId: FROST, ownerUserId: CORA, edition: "2024", name: "Frost" });
    if (foreign === "limit") throw new Error("limit");
    new CampaignSettingsRepo(s.db).put(EMBER, { turnPing: { enabled: true, channelId: "300000000000000001" } });
    const crafted = { ...s.battle, encounter: { ...s.battle.encounter, combatants: [{ ...s.battle.encounter.combatants[4], id: "x1", ref: { source: "character" as const, id: foreign.id } }, ...s.battle.encounter.combatants] } };
    const pingTurn = vi.fn(async () => {});
    const run = sideEffects({ sheets: () => s.sheets, notes: () => new NoteRepo(s.db), battleRolls: () => new BattleInitiativeRepo(s.db), settings: () => new CampaignSettingsRepo(s.db), pushRoster: vi.fn(async () => {}), clearRoster: vi.fn(async () => {}), pingTurn });
    await run.afterSave({ ...crafted, encounter: { ...crafted.encounter, turn: 1 } }, { ...crafted, encounter: { ...crafted.encounter, turn: 0 } });
    expect(pingTurn).not.toHaveBeenCalled();
  });
});

describe("linked states", () => {
  it("read the sheet, not the encounter's copy", () => {
    const { battle, sheets, aria } = setup();
    const linked = linkedStates(battle.encounter, sheets, EMBER);
    expect(linked.get(aria.id)?.maxHp).toBeGreaterThan(1);
    expect(toPlayerView(battle, linked, "999999999999999999", []).me).toBeNull();
  });
});
