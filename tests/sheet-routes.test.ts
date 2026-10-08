import { describe, expect, it, vi } from "vitest";
import { UserRepo } from "@/lib/access/grants";
import { resolveAccess, type Grant } from "@/lib/access/permissions";
import { openDatabase } from "@/lib/dm/db";
import { FeatRepo } from "@/lib/dm/feats";
import { SpellRepo } from "@/lib/dm/spells";
import { homebrewCollection, homebrewItem } from "@/lib/play/homebrewRoutes";
import { RateLimiter } from "@/lib/rateLimit";
import { newBody } from "@/lib/sheets/body";
import { SheetRepo } from "@/lib/sheets/repo";
import { sheetCollection, sheetCopy, sheetItem, sheetMeta, sheetOps, sheetPlayers, sheetResolve, sheetRoll, sheetVitals } from "@/lib/sheets/routes";

const OWNER = "100000000000000001"; // the portal owner
const ARIA = "100000000000000002"; // a player in Ember
const BRAM = "100000000000000003"; // another player in Ember
const CORA = "100000000000000004"; // a player in Frost only
const CODM_FROST = "100000000000000005"; // co-DM of Frost only
const EMBER = "aaaaaaaaaaaa";
const FROST = "bbbbbbbbbbbb";
const R_EMBER = "200000000000000001";
const R_FROST = "200000000000000002";
const R_CODM = "200000000000000003";
const GRANTS: Grant[] = [
  { roleId: R_EMBER, permissions: ["play"], scope: [EMBER] },
  { roleId: R_FROST, permissions: ["play"], scope: [FROST] },
  { roleId: R_CODM, permissions: ["dm"], scope: [FROST] },
];
const ROLES: Record<string, string[]> = { [ARIA]: [R_EMBER], [BRAM]: [R_EMBER], [CORA]: [R_FROST], [CODM_FROST]: [R_CODM] };

function setup() {
  const db = openDatabase(":memory:");
  const users = new UserRepo(db);
  for (const [id, roles] of Object.entries(ROLES)) users.upsert(id, `user ${id.slice(-1)}`, null, roles);
  users.upsert(OWNER, "Owner", null, []);
  const synced: Array<[string, string, string | null]> = [];
  const announced: unknown[] = [];
  let as: string | null = OWNER;
  const deps = {
    getAccess: async () => (as ? resolveAccess(as, ROLES[as] ?? [], [OWNER], GRANTS) : null),
    limiter: new RateLimiter(),
    rollLimiter: new RateLimiter(),
    sheets: () => new SheetRepo(db),
    users: () => users,
    spells: () => new SpellRepo(db),
    feats: () => new FeatRepo(db),
    srdSpells: () => ({ list: () => [], get: () => null }),
    srdFeats: () => ({ list: () => [], get: () => null }),
    campaignIds: async () => new Set([EMBER, FROST]),
    playsIn: (userId: string, roleIds: string[], campaignId: string) => resolveAccess(userId, roleIds, [OWNER], GRANTS).grants.get("play") !== undefined && (ROLES[userId] ?? []).some((r) => GRANTS.find((g) => g.roleId === r)?.scope.includes(campaignId)),
    syncName: vi.fn(async (campaignId: string, userId: string, name: string | null) => {
      synced.push([campaignId, userId, name]);
      return true;
    }),
    announce: vi.fn(async (roll: unknown) => {
      announced.push(roll);
      return true;
    }),
    rng: () => 10,
  };
  return { db, deps, synced, announced, act: (user: string | null) => (as = user) };
}

function req(method: string, body?: unknown, query = "") {
  return new Request(`https://portal.example/api/sheets${query}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "x-portal-request": "1", "sec-fetch-site": "same-origin", ...(body === undefined ? {} : { "content-type": "application/json" }) },
  });
}

async function create(deps: ReturnType<typeof setup>["deps"], campaignId: string, name: string, ownerUserId?: string | null) {
  const response = await sheetCollection(deps).POST(req("POST", { campaignId, name, ...(ownerUserId !== undefined ? { ownerUserId } : {}) }));
  return { status: response.status, body: (await response.json()) as { id: string; active: boolean; dmNotes?: string; owner: unknown } };
}

describe("who may see and change a sheet", () => {
  it("lets a player make and edit their own sheet, and nobody else's", async () => {
    const { deps, act } = setup();
    act(ARIA);
    const mine = await create(deps, EMBER, "Aria");
    expect(mine.status).toBe(201);
    expect(mine.body.active).toBe(true);
    act(BRAM);
    expect((await sheetItem(deps).GET(req("GET"), mine.body.id)).status).toBe(404);
    expect((await sheetOps(deps).POST(req("POST", { ops: [{ op: "damage", amount: 3 }] }), mine.body.id)).status).toBe(404);
    act(CORA);
    expect((await sheetItem(deps).GET(req("GET"), mine.body.id)).status).toBe(404);
    expect((await create(deps, EMBER, "Sneaky")).status).toBe(404);
    act(null);
    expect((await sheetItem(deps).GET(req("GET"), mine.body.id)).status).toBe(401);
  });

  it("lets a manager see every sheet in their campaign only", async () => {
    const { deps, act } = setup();
    act(ARIA);
    const ember = await create(deps, EMBER, "Aria");
    act(CORA);
    const frost = await create(deps, FROST, "Cora");
    act(CODM_FROST);
    expect((await sheetItem(deps).GET(req("GET"), frost.body.id)).status).toBe(200);
    expect((await sheetItem(deps).GET(req("GET"), ember.body.id)).status).toBe(404);
    const list = (await (await sheetCollection(deps).GET(req("GET", undefined, `?campaign=${FROST}`))).json()) as unknown[];
    expect(list).toHaveLength(1);
    expect((await sheetCollection(deps).GET(req("GET", undefined, `?campaign=${EMBER}`))).status).toBe(404);
  });

  it("lists only the player's own sheets", async () => {
    const { deps, act } = setup();
    act(ARIA);
    await create(deps, EMBER, "Aria");
    act(BRAM);
    await create(deps, EMBER, "Bram");
    const list = (await (await sheetCollection(deps).GET(req("GET", undefined, `?campaign=${EMBER}`))).json()) as Array<{ name: string }>;
    expect(list.map((s) => s.name)).toEqual(["Bram"]);
  });

  it("never sends the DM's notes to the player", async () => {
    const { deps, act } = setup();
    act(ARIA);
    const sheet = await create(deps, EMBER, "Aria");
    act(OWNER);
    await sheetMeta(deps).PATCH(req("PATCH", { dmNotes: "SECRET-PLOT-TWIST" }), sheet.body.id);
    act(ARIA);
    const text = await (await sheetItem(deps).GET(req("GET"), sheet.body.id)).text();
    expect(text).not.toContain("SECRET-PLOT-TWIST");
    expect(text).not.toContain("dmNotes");
    expect(text).not.toContain(ARIA); // a player's own Discord id is not echoed back either
    act(OWNER);
    expect(await (await sheetItem(deps).GET(req("GET"), sheet.body.id)).text()).toContain("SECRET-PLOT-TWIST");
  });

  it("keeps players to retiring their own sheet; managers do the rest", async () => {
    const { deps, act } = setup();
    act(ARIA);
    const sheet = await create(deps, EMBER, "Aria");
    expect((await sheetMeta(deps).PATCH(req("PATCH", { status: "retired" }), sheet.body.id)).status).toBe(200);
    expect((await sheetMeta(deps).PATCH(req("PATCH", { active: true }), sheet.body.id)).status).toBe(403);
    expect((await sheetMeta(deps).PATCH(req("PATCH", { ownerUserId: BRAM }), sheet.body.id)).status).toBe(403);
    expect((await sheetMeta(deps).PATCH(req("PATCH", { dmNotes: "x" }), sheet.body.id)).status).toBe(403);
    expect((await sheetItem(deps).DELETE(req("DELETE"), sheet.body.id)).status).toBe(404);
    act(OWNER);
    expect((await sheetItem(deps).DELETE(req("DELETE"), sheet.body.id)).status).toBe(204);
  });
});

describe("active sheets and the bot's character names", () => {
  it("makes the first sheet active, swaps on request, and tells the bot each time", async () => {
    const { deps, act, synced } = setup();
    act(ARIA);
    const first = await create(deps, EMBER, "Aria");
    const second = await create(deps, EMBER, "Backup");
    expect(second.body.active).toBe(false);
    expect(synced.at(-1)).toEqual([EMBER, ARIA, "Aria"]);
    act(OWNER);
    await sheetMeta(deps).PATCH(req("PATCH", { active: true }), second.body.id);
    expect(synced.at(-1)).toEqual([EMBER, ARIA, "Backup"]);
    expect(deps.sheets().get(first.body.id)?.active).toBe(false);
    await sheetMeta(deps).PATCH(req("PATCH", { status: "retired" }), second.body.id);
    expect(synced.at(-1)).toEqual([EMBER, ARIA, null]);
  });

  it("resyncs both players when a sheet changes hands, and marks a failed sync pending", async () => {
    const { deps, act, synced } = setup();
    act(OWNER);
    const sheet = await create(deps, EMBER, "Hero", ARIA);
    await sheetMeta(deps).PATCH(req("PATCH", { ownerUserId: BRAM }), sheet.body.id);
    expect(synced.slice(-2)).toEqual([
      [EMBER, BRAM, "Hero"],
      [EMBER, ARIA, null],
    ]);
    deps.syncName.mockImplementation(async () => false);
    const body = deps.sheets().get(sheet.body.id)!;
    await sheetItem(deps).PUT(req("PUT", { version: body.version, body: { ...body.body, identity: { ...body.body.identity, name: "Renamed" } } }), sheet.body.id);
    expect(deps.sheets().get(sheet.body.id)?.nameSync).toBe("pending");
  });

  it("refuses to hand a sheet to someone who never signed in", async () => {
    const { deps, act } = setup();
    act(OWNER);
    expect((await create(deps, EMBER, "Hero", "100000000000000999")).status).toBe(400);
  });

  it("lists who a manager may give a sheet to", async () => {
    const { deps, act } = setup();
    act(OWNER);
    const players = (await (await sheetPlayers(deps).GET(req("GET", undefined, `?campaign=${EMBER}`))).json()) as Array<{ userId: string }>;
    expect(players.map((p) => p.userId).sort()).toEqual([ARIA, BRAM].sort());
    act(ARIA);
    expect((await sheetPlayers(deps).GET(req("GET", undefined, `?campaign=${EMBER}`))).status).toBe(404);
  });
});

describe("saving and live play", () => {
  it("saves with a version and answers 409 with the current sheet when stale", async () => {
    const { deps, act } = setup();
    act(ARIA);
    const { body } = await create(deps, EMBER, "Aria");
    const sheet = deps.sheets().get(body.id)!;
    expect((await sheetItem(deps).PUT(req("PUT", { version: sheet.version, body: sheet.body }), body.id)).status).toBe(200);
    const stale = await sheetItem(deps).PUT(req("PUT", { version: sheet.version, body: sheet.body }), body.id);
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { current: { version: number } }).current.version).toBe(sheet.version + 1);
  });

  it("lets two people change vitals at once without losing either change", async () => {
    const { deps, act } = setup();
    act(ARIA);
    const { body } = await create(deps, EMBER, "Aria");
    const start = deps.sheets().get(body.id)!.vitals.hp;
    act(OWNER);
    const dm = sheetOps(deps).POST(req("POST", { ops: [{ op: "damage", amount: 3 }] }), body.id);
    act(ARIA);
    const player = sheetOps(deps).POST(req("POST", { ops: [{ op: "addCondition", name: "Prone", rounds: null }] }), body.id);
    await Promise.all([dm, player]);
    const after = deps.sheets().get(body.id)!.vitals;
    expect(after.hp).toBe(start - 3);
    expect(after.conditions.map((c) => c.name)).toEqual(["Prone"]);
  });

  it("answers 304 while vitals are unchanged, and 422 for a refused op", async () => {
    const { deps, act } = setup();
    act(ARIA);
    const { body } = await create(deps, EMBER, "Aria");
    const version = deps.sheets().get(body.id)!.vitalsVersion;
    expect((await sheetVitals(deps).GET(req("GET", undefined, `?since=${version}`), body.id)).status).toBe(304);
    expect((await sheetVitals(deps).GET(req("GET", undefined, `?since=${version - 1}`), body.id)).status).toBe(200);
    expect((await sheetOps(deps).POST(req("POST", { ops: [{ op: "spendSlot", level: 1 }] }), body.id)).status).toBe(422);
    expect((await sheetOps(deps).POST(req("POST", { ops: [{ op: "hack" }] }), body.id)).status).toBe(400);
  });

  it("rolls on the server and posts to Discord with the character's name", async () => {
    const { deps, act, announced } = setup();
    act(ARIA);
    const { body } = await create(deps, EMBER, "Aria");
    const response = await sheetRoll(deps).POST(req("POST", { expression: "1d20+5", label: "Stealth", mode: "advantage", announce: true }), body.id);
    const result = (await response.json()) as { total: number; announced: boolean; label: string };
    expect(result).toMatchObject({ total: 15, announced: true, label: "Stealth (advantage)" });
    expect(announced[0]).toMatchObject({ label: "Aria · Stealth (advantage)", total: 15 });
    expect((await sheetRoll(deps).POST(req("POST", { expression: "1d20+5", label: "x", total: 20 }), body.id)).status).toBe(400);
    expect((await sheetRoll(deps).POST(req("POST", { expression: "rm -rf", label: "x" }), body.id)).status).toBe(400);
  });

  it("limits rolls to Discord per player", async () => {
    const { deps, act } = setup();
    act(ARIA);
    const { body } = await create(deps, EMBER, "Aria");
    let last = 200;
    for (let i = 0; i < 11; i++) last = (await sheetRoll(deps).POST(req("POST", { expression: "1d20", label: "Spam", announce: true }), body.id)).status;
    expect(last).toBe(429);
  });

  it("copies a sheet to another campaign the player is in, without its custom spells", async () => {
    const { deps, act } = setup();
    act(OWNER);
    const { body } = await create(deps, EMBER, "Hero", ARIA);
    const sheet = deps.sheets().get(body.id)!;
    const withSpell = structuredClone(sheet.body);
    withSpell.spellcasting.entries = [
      { id: "a", ref: { source: "custom", id: "11111111-1111-4111-8111-111111111111" }, classId: null, status: "known", notes: "" },
      { id: "b", ref: { source: "srd", edition: "2024", slug: "fireball" }, classId: null, status: "known", notes: "" },
    ];
    deps.sheets().saveBody(body.id, sheet.version, withSpell);
    const copy = await sheetCopy(deps).POST(req("POST", { campaignId: FROST }), body.id);
    expect(copy.status).toBe(201);
    const copied = deps.sheets().get(((await copy.json()) as { id: string }).id)!;
    expect(copied.campaignId).toBe(FROST);
    expect(copied.body.spellcasting.entries.map((e) => e.id)).toEqual(["b"]);
    act(ARIA);
    // Aria does not play in Frost.
    expect((await sheetCopy(deps).POST(req("POST", { campaignId: FROST }), body.id)).status).toBe(404);
  });
});

describe("homebrew", () => {
  const spell = {
    name: "Aria's Spark",
    level: 0,
    school: "evocation",
    castingTime: "1 action",
    ritual: false,
    range: "30 feet",
    components: { verbal: true, somatic: false, material: false, materialText: "", materialCostGp: null, materialConsumed: false },
    duration: "Instantaneous",
    concentration: false,
    classes: [],
    attack: "ranged",
    save: null,
    effect: { kind: "damage", roll: "1d6", types: ["lightning"] },
    scaling: null,
    description: "",
    higherLevel: "",
  };

  it("is private to its author until the DM shares it, then read-only to them", async () => {
    const { deps, act } = setup();
    act(ARIA);
    const created = await homebrewCollection(deps, "spells").POST(req("POST", { ...spell, campaignId: EMBER }));
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect((await homebrewCollection(deps, "spells").POST(req("POST", { ...spell, campaignId: FROST }))).status).toBe(404);

    const { body } = await create(deps, EMBER, "Aria");
    const ref = `custom:${id}`;
    const resolved = async () => ((await (await sheetResolve(deps).GET(req("GET", undefined, `?spells=${ref}`), sheetId)).json()) as { spells: Record<string, unknown> }).spells[ref];
    const sheetId = body.id;
    expect(await resolved()).not.toBeNull();

    act(BRAM);
    const bram = await create(deps, EMBER, "Bram");
    const bramSees = (await (await sheetResolve(deps).GET(req("GET", undefined, `?spells=${ref}`), bram.body.id)).json()) as { spells: Record<string, unknown> };
    expect(bramSees.spells[ref]).toBeNull();
    expect((await homebrewItem(deps, "spells").GET(req("GET"), id)).status).toBe(404);

    deps.spells().setShared(id, true);
    const shared = (await (await sheetResolve(deps).GET(req("GET", undefined, `?spells=${ref}`), bram.body.id)).json()) as { spells: Record<string, unknown> };
    expect(shared.spells[ref]).not.toBeNull();
    act(ARIA);
    expect((await homebrewItem(deps, "spells").PUT(req("PUT", { ...spell, name: "Changed", campaignId: EMBER }), id)).status).toBe(409);
    expect((await homebrewItem(deps, "spells").DELETE(req("DELETE"), id)).status).toBe(409);
  });

  it("refuses a sheet in another campaign the player's homebrew", async () => {
    const { deps, act } = setup();
    act(OWNER);
    const frostSheet = await create(deps, FROST, "Frost hero", CORA);
    act(ARIA);
    const { id } = (await (await homebrewCollection(deps, "spells").POST(req("POST", { ...spell, campaignId: EMBER }))).json()) as { id: string };
    act(OWNER);
    const resolved = (await (await sheetResolve(deps).GET(req("GET", undefined, `?spells=custom:${id}`), frostSheet.body.id)).json()) as { spells: Record<string, unknown> };
    expect(resolved.spells[`custom:${id}`]).toBeNull();
  });
});

describe("sheets", () => {
  it("start valid", () => {
    expect(newBody("x").classes).toHaveLength(1);
  });
});
