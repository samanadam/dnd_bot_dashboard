import { describe, expect, it } from "vitest";
import { matchRule } from "@/lib/bot/allowlist";
import { addBonus, addDie, emptyTray, MAX_BONUS, MAX_PER_DIE, removeDie, toExpression } from "@/lib/dice/pick";
import { DICE_LIMITS, parseDice } from "@/lib/dice/roll";
import { openDatabase } from "@/lib/dm/db";
import { encounterSchema, launchCopy, type Combatant } from "@/lib/dm/encounter";
import { encounterCollection, encounterLaunch } from "@/lib/dm/encounterRoutes";
import { EncounterRepo } from "@/lib/dm/encounters";
import { matchedReports, matchReport } from "@/lib/dm/initiativeReports";
import { sceneCollection, sceneItem } from "@/lib/dm/sceneRoutes";
import { MAX_LAYERS, MAX_SCENES, SceneRepo, sceneSchema } from "@/lib/dm/scenes";
import { RateLimiter } from "@/lib/rateLimit";

const DM = "111111111111111111";
const CAMPAIGN = "0123456789ab";

describe("dice picker", () => {
  it("builds notation from taps, smallest die first", () => {
    let tray = emptyTray;
    expect(toExpression(tray)).toBe("");
    tray = addDie(addDie(addDie(tray, 6), 6), 20);
    expect(toExpression(tray)).toBe("2d6+1d20");
    tray = addBonus(tray, 3);
    expect(toExpression(tray)).toBe("2d6+1d20+3");
    tray = addBonus(tray, -5);
    expect(toExpression(tray)).toBe("2d6+1d20-2");
    tray = removeDie(removeDie(tray, 6), 6);
    expect(toExpression(tray)).toBe("1d20-2");
  });

  it("never builds something the roller would refuse", () => {
    let tray = emptyTray;
    for (const sides of [4, 6, 8, 10, 12, 20, 100]) for (let i = 0; i < 40; i++) tray = addDie(tray, sides);
    for (let i = 0; i < 300; i++) tray = addBonus(tray, 1);
    expect(tray.dice[6]).toBe(MAX_PER_DIE);
    expect(tray.bonus).toBe(MAX_BONUS);
    const text = toExpression(tray);
    expect(text.length).toBeLessThanOrEqual(DICE_LIMITS.length);
    expect(() => parseDice(text)).not.toThrow();
    expect(parseDice(text).length).toBeLessThanOrEqual(DICE_LIMITS.terms);
  });

  it("ignores dice that are not on the picker", () => {
    expect(addDie(emptyTray, 7)).toBe(emptyTray);
    expect(addDie(emptyTray, 1000)).toBe(emptyTray);
  });
});

function combatant(over: Partial<Combatant>): Combatant {
  return {
    id: "c1", name: "Goblin", kind: "monster", ref: null, initiative: 12, initiativeBonus: 2, ac: 15, hp: 3, maxHp: 7,
    tempHp: 4, conditions: [{ name: "Prone", rounds: 2 }], concentration: true, friendly: false, notes: "", ...over,
  };
}

describe("prepared encounters", () => {
  it("launches a clean copy without touching the template", () => {
    const template = { name: "Ambush", round: 3, turn: 1, combatants: [combatant({}), combatant({ id: "c2", name: "Ally", friendly: true })] };
    const copy = launchCopy(template);
    expect(copy.round).toBe(0);
    expect(copy.combatants.map((c) => [c.initiative, c.hp, c.tempHp, c.conditions.length, c.concentration])).toEqual([
      [null, 7, 0, 0, false],
      [null, 7, 0, 0, false],
    ]);
    expect(copy.combatants[1].friendly).toBe(true);
    expect(template.combatants[0].hp).toBe(3);
  });

  it("reads encounters saved before allies existed", () => {
    const legacy = { name: "Old", round: 0, turn: 0, combatants: [{ ...combatant({}), friendly: undefined }] };
    const parsed = encounterSchema.parse(legacy);
    expect(parsed.combatants[0].friendly).toBe(false);
  });

  it("stores kind, launches only prepared ones, and keeps the campaign", () => {
    const repo = new EncounterRepo(openDatabase(":memory:"));
    const template = repo.create("Cragmaw ambush", CAMPAIGN, "prepared");
    repo.save(template.id, 1, { ...template.encounter, combatants: [combatant({})] });
    const live = repo.create("Running fight");

    const started = repo.launch(template.id);
    expect(started).not.toBeNull();
    expect(started).not.toBe("not_prepared");
    if (started === null || started === "not_prepared") return;
    expect(started.id).not.toBe(template.id);
    expect(started).toMatchObject({ kind: "live", campaignId: CAMPAIGN });
    expect(started.encounter.combatants[0]).toMatchObject({ hp: 7, initiative: null });
    // Launching again gives another fresh copy; the template is unchanged.
    expect(repo.launch(template.id)).not.toBe("not_prepared");
    expect(repo.get(template.id)).toMatchObject({ kind: "prepared", version: 2 });
    expect(repo.launch(live.id)).toBe("not_prepared");
    expect(repo.launch("00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(repo.list(CAMPAIGN).filter((e) => e.kind === "prepared")).toHaveLength(1);
  });

  function setup() {
    const repo = new EncounterRepo(openDatabase(":memory:"));
    const logs: unknown[] = [];
    const deps = { getUserId: async () => DM, dmIds: [DM], limiter: new RateLimiter(), encounters: () => repo, log: (e: unknown) => logs.push(e) };
    return { repo, logs, collection: encounterCollection(deps), launch: encounterLaunch(deps) };
  }
  const post = (path: string, body?: unknown) =>
    new Request(`https://portal.example${path}`, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { "x-portal-request": "1", "content-type": "application/json", "sec-fetch-site": "same-origin" },
    });

  it("launches over HTTP with the same guards as every other DM write", async () => {
    const { repo, logs, collection, launch } = setup();
    const made = await collection.POST(post("/api/dm/encounters", { name: "Prep", kind: "prepared" }));
    const template = (await made.json()) as { id: string; kind: string };
    expect(made.status).toBe(201);
    expect(template.kind).toBe("prepared");

    const ok = await launch.POST(post(`/api/dm/encounters/${template.id}/launch`), template.id);
    expect(ok.status).toBe(201);
    expect(logs.at(-1)).toMatchObject({ path: "dm/encounters/:id/launch" });
    const liveId = ((await ok.json()) as { id: string }).id;
    expect((await launch.POST(post(`/api/dm/encounters/${liveId}/launch`), liveId)).status).toBe(409);
    expect((await launch.POST(post("/api/dm/encounters/nope/launch"), "nope")).status).toBe(404);

    const outsider = encounterLaunch({ getUserId: async () => "999", dmIds: [DM], limiter: new RateLimiter(), encounters: () => repo });
    expect((await outsider.POST(post(`/api/dm/encounters/${template.id}/launch`), template.id)).status).toBe(404);
    const crossSite = new Request(`https://portal.example/api/dm/encounters/${template.id}/launch`, { method: "POST", headers: { "x-portal-request": "1", "sec-fetch-site": "cross-site" } });
    expect((await launch.POST(crossSite, template.id)).status).toBe(403);
    expect((await collection.POST(post("/api/dm/encounters", { name: "x", kind: "weird" }))).status).toBe(400);
  });
});

describe("scenes", () => {
  const scene = (over: Record<string, unknown> = {}) => ({
    name: "Rainy tavern",
    category: "Taverns",
    replace: true,
    music: { source: "r2", id: "music/tavern.opus", title: "Tavern", volume: 0.6 },
    layers: [{ kind: "ambience", id: "music/ambience/rain.opus", title: "Rain", volume: 0.8 }],
    ...over,
  });

  it("validates strictly", () => {
    expect(sceneSchema.safeParse(scene()).success).toBe(true);
    expect(sceneSchema.safeParse(scene({ extra: 1 })).success).toBe(false);
    expect(sceneSchema.safeParse(scene({ name: "" })).success).toBe(false);
    expect(sceneSchema.safeParse(scene({ layers: [{ kind: "ambience", id: "a\nb", title: "x", volume: 1 }] })).success).toBe(false);
    expect(sceneSchema.safeParse(scene({ layers: [{ kind: "ambience", id: "a", title: "x", volume: 3 }] })).success).toBe(false);
    expect(sceneSchema.safeParse(scene({ layers: Array.from({ length: MAX_LAYERS + 1 }, () => ({ kind: "sfx", id: "a", title: "x", volume: 1 })) })).success).toBe(false);
    expect(sceneSchema.safeParse(scene({ campaignId: "nope" })).success).toBe(false);
  });

  it("stores scenes per campaign, keeps the campaign on a plain update, and caps the count", () => {
    const repo = new SceneRepo(openDatabase(":memory:"));
    const created = repo.create(sceneSchema.parse(scene({ campaignId: CAMPAIGN })))!;
    repo.create(sceneSchema.parse(scene({ name: "Loose" })));
    expect(repo.list(CAMPAIGN).map((s) => s.id)).toEqual([created.id]);
    expect(repo.list("unassigned")).toHaveLength(1);
    expect(repo.update(created.id, sceneSchema.parse(scene({ name: "Renamed" })))).toMatchObject({ name: "Renamed", campaignId: CAMPAIGN });
    expect(repo.update(created.id, sceneSchema.parse(scene({ campaignId: null })))?.campaignId).toBeNull();
    expect(repo.remove(created.id)).toBe(true);
    expect(repo.get("../etc")).toBeNull();

    const db = openDatabase(":memory:");
    const full = new SceneRepo(db);
    for (let i = 0; i < MAX_SCENES; i++) expect(full.create(sceneSchema.parse(scene({ name: `S${i}` })))).not.toBeNull();
    expect(full.create(sceneSchema.parse(scene()))).toBeNull();
  });

  it("guards its routes like the rest of the DM API", async () => {
    const repo = new SceneRepo(openDatabase(":memory:"));
    const deps = { getUserId: async () => DM, dmIds: [DM], limiter: new RateLimiter(), scenes: () => repo };
    const collection = sceneCollection(deps);
    const item = sceneItem(deps);
    const req = (method: string, body?: unknown) =>
      new Request("https://portal.example/api/dm/scenes", {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: { "x-portal-request": "1", "content-type": "application/json", "sec-fetch-site": "same-origin" },
      });

    const created = await collection.POST(req("POST", scene()));
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { id: string }).id;
    expect((await collection.POST(req("POST", scene({ music: { source: "r2", id: " ", title: "x", volume: null } })))).status).toBe(400);
    expect((await item.GET(req("GET"), id)).status).toBe(200);
    expect((await item.GET(req("GET"), "x")).status).toBe(404);
    expect((await item.DELETE(req("DELETE"), id)).status).toBe(204);

    const outsider = sceneCollection({ ...deps, getUserId: async () => "999" });
    expect((await outsider.GET(req("GET"))).status).toBe(404);
    const anonymous = sceneCollection({ ...deps, getUserId: async () => null });
    expect((await anonymous.GET(req("GET"))).status).toBe(401);
  });
});

describe("initiative reports", () => {
  const cs = [
    combatant({ id: "a", name: "Aria", kind: "player" }),
    combatant({ id: "g1", name: "Goblin" }),
    combatant({ id: "g2", name: "Goblin 2" }),
    combatant({ id: "m", name: "Aria", kind: "monster" }),
    combatant({ id: "t1", name: "Twin" }),
    combatant({ id: "t2", name: "twin" }),
  ];

  it("matches a whole name, ignoring case and spacing", () => {
    expect(matchReport({ label: "  goblin " }, cs)?.id).toBe("g1");
    expect(matchReport({ label: "GOBLIN   2" }, cs)?.id).toBe("g2");
    expect(matchReport({ label: "Gob" }, cs)).toBeNull();
    expect(matchReport({ label: "" }, cs)).toBeNull();
  });

  it("never guesses between two possible targets, and prefers the player", () => {
    expect(matchReport({ label: "Twin" }, cs)).toBeNull();
    expect(matchReport({ label: "aria" }, cs)?.id).toBe("a");
  });

  it("pairs only the reports that match exactly one combatant", () => {
    const pairs = matchedReports(
      [
        { id: 1, label: "Aria", value: 17 },
        { id: 2, label: "Nobody", value: 5 },
        { id: 3, label: "Twin", value: 9 },
      ],
      cs,
    );
    expect(pairs.map((p) => [p.report.id, p.target.id])).toEqual([[1, "a"]]);
  });
});

describe("allowlist for the new bot calls", () => {
  it("passes only validated search, queue, seek and initiative requests", () => {
    const search = matchRule("GET", ["transcripts", "search"])!.rule.query!;
    expect(search.safeParse({ q: "eldrin" }).success).toBe(true);
    expect(search.safeParse({ q: "" }).success).toBe(false);
    expect(search.safeParse({ q: "x".repeat(201) }).success).toBe(false);
    expect(search.safeParse({ q: "a", limit: "500" }).success).toBe(false);
    expect(search.safeParse({ q: "a", other: "b" }).success).toBe(false);

    const seek = matchRule("POST", ["music", "seek"])!.rule.body!;
    expect(seek.safeParse({ position_seconds: 95 }).success).toBe(true);
    for (const bad of [{ position_seconds: -1 }, { position_seconds: 90_000 }, { position_seconds: "5" }, {}]) {
      expect(seek.safeParse(bad).success).toBe(false);
    }

    expect(matchRule("POST", ["transcription", "sync"])).toMatchObject({ rule: { dmOnly: true, audit: true } });
    expect(matchRule("GET", ["transcription"])?.rule.dmOnly).toBeUndefined();
    expect(matchRule("GET", ["initiative"])?.rule.dmOnly).toBe(true);
    const clear = matchRule("POST", ["initiative", "clear"])!;
    expect(clear.rule.dmOnly).toBe(true);
    expect(clear.rule.body!.safeParse({}).success).toBe(true);
    expect(clear.rule.body!.safeParse({ id: 4 }).success).toBe(true);
    for (const bad of [{ id: 0 }, { id: "4" }, { id: 4.5 }, { all: true }]) expect(clear.rule.body!.safeParse(bad).success).toBe(false);
    expect(matchRule("DELETE", ["initiative"])).toBeNull();
  });
});
