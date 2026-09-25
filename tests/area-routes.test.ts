import { describe, expect, it } from "vitest";
import { AreaRepo } from "@/lib/dm/areas";
import { areaCollection, areaEncounters, areaItem, areaOrder, areaReward, areaRewards } from "@/lib/dm/areaRoutes";
import type { AreaDetail, RefLookup } from "@/lib/dm/areaView";
import { creatureSearch } from "@/lib/dm/creatureSearch";
import { CreatureRepo } from "@/lib/dm/creatures";
import { openDatabase } from "@/lib/dm/db";
import { EncounterRepo } from "@/lib/dm/encounters";
import { itemCollection, itemItem, itemSearch, srdItem } from "@/lib/dm/itemRoutes";
import { ItemRepo } from "@/lib/dm/items";
import { RateLimiter } from "@/lib/rateLimit";
import { goblin } from "./fixtures/goblin";

const DM = "111111111111111111";
const PLAYER = "222222222222222222";
const BASE = "https://portal.example/api/dm";

const lookup: RefLookup = {
  item: (ref) => (ref.source === "srd" && ref.slug === "longsword" ? { name: "Longsword", category: "Weapon", rarity: "" } : null),
  creature: (ref) => (ref.source === "srd" && ref.slug === "goblin" ? { name: "Goblin" } : null),
};

const srdList = [
  { edition: "2014" as const, slug: "longsword", name: "Longsword", category: "Weapon", rarity: "", attunement: false },
  { edition: "2014" as const, slug: "ring-of-protection", name: "Ring of Protection", category: "Ring", rarity: "Rare", attunement: true },
  { edition: "2024" as const, slug: "longsword", name: "Longsword", category: "Weapon", rarity: "", attunement: false },
];
const srdBlock = { name: "Longsword", category: "Weapon", rarity: "", attunement: "", costGp: 15, weightLb: 3, detail: "1d8 slashing", description: "" };

function setup(user: string | null = DM) {
  const db = openDatabase(":memory:");
  const logs: unknown[] = [];
  const deps = {
    getUserId: async () => user,
    dmIds: [DM],
    limiter: new RateLimiter(),
    areas: () => new AreaRepo(db),
    encounters: () => new EncounterRepo(db),
    items: () => new ItemRepo(db),
    repo: () => new CreatureRepo(db),
    lookup: () => lookup,
    srdItems: () => ({ list: () => srdList, get: (edition: "2014" | "2024", slug: string) => (edition === "2014" && slug === "longsword" ? srdBlock : null) }),
    srdMonsters: () => [{ id: "srd-2014:goblin", slug: "goblin", edition: "2014" as const, kind: "monster" as const, name: "Goblin", cr: "1/4", type: "humanoid", size: "Small", hp: 7, ac: 15 }],
    log: (entry: unknown) => logs.push(entry),
  };
  return { db, logs, deps, encounters: new EncounterRepo(db) };
}

function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`${BASE}/${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      "x-portal-request": "1",
      "sec-fetch-site": "same-origin",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
  });
}

async function createArea(deps: ReturnType<typeof setup>["deps"], name = "Goblin cave"): Promise<AreaDetail> {
  const response = await areaCollection(deps).POST(req("POST", "areas", { name, summary: "", notes: "" }));
  expect(response.status).toBe(201);
  return response.json();
}

describe("area routes", () => {
  it("full lifecycle: create, edit, link a battle, add rewards, tick one, delete", async () => {
    const { deps, encounters, logs } = setup();
    const prepared = encounters.create("Ambush", null, "prepared");

    const created = await createArea(deps);
    const id = created.area.id;
    expect(created).toMatchObject({ battles: [], rewards: [] });

    const renamed = await areaItem(deps).PUT(req("PUT", `areas/${id}`, { version: 1, name: "Goblin den", summary: "damp", notes: "" }), id);
    expect(renamed.status).toBe(200);
    expect((await renamed.json()).area).toMatchObject({ name: "Goblin den", version: 2 });

    const linked = await areaEncounters(deps).PUT(req("PUT", `areas/${id}/encounters`, { version: 2, encounterIds: [prepared.id] }), id);
    const linkedBody: AreaDetail = await linked.json();
    expect(linkedBody.battles).toEqual([{ id: prepared.id, name: "Ambush", combatants: 0, prepared: true }]);

    const rewards = await areaRewards(deps).PUT(
      req("PUT", `areas/${id}/rewards`, {
        version: linkedBody.area.version,
        rewards: [
          { kind: "item", encounterId: prepared.id, status: "planned", itemRef: { source: "srd", edition: "2014", slug: "longsword" }, quantity: 2, note: "" },
          { kind: "item", encounterId: null, status: "planned", itemRef: { source: "srd", edition: "2014", slug: "gone" }, quantity: 1, note: "" },
          { kind: "pointer", encounterId: null, status: "pending", title: "Friend of the village", condition: "Save the mayor", outcome: "Shelter in act 3", npcRef: { source: "srd", edition: "2014", slug: "goblin" } },
        ],
      }),
      id,
    );
    const rewardBody: AreaDetail = await rewards.json();
    // Names are resolved on the server; an item that no longer exists is null.
    expect(rewardBody.rewards.map((reward) => reward.resolved)).toEqual([{ name: "Longsword", category: "Weapon", rarity: "" }, null, { name: "Goblin" }]);

    const first = rewardBody.rewards[0];
    const ticked = await areaReward(deps).PATCH(req("PATCH", `areas/${id}/rewards/${first.id}`, { status: "given" }), id, first.id);
    expect(ticked.status).toBe(200);
    expect((await ticked.json()).rewards[0].status).toBe("given");

    const list = await (await areaCollection(deps).GET(req("GET", "areas"))).json();
    expect(list[0]).toMatchObject({ id, battles: 1, rewardsTotal: 3, rewardsDone: 1 });

    expect((await areaItem(deps).DELETE(req("DELETE", `areas/${id}`), id)).status).toBe(204);
    expect((await areaItem(deps).GET(req("GET", `areas/${id}`), id)).status).toBe(404);

    // Writes are audited by route, never with their contents.
    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toContain("Save the mayor");
    expect(JSON.stringify(logs)).not.toContain("Goblin den");
  });

  it("answers a stale version with 409 and refuses a battle that is not prepared", async () => {
    const { deps, encounters } = setup();
    const live = encounters.create("Running", null, "live");
    const { area } = await createArea(deps);
    const id = area.id;

    const stale = await areaItem(deps).PUT(req("PUT", `areas/${id}`, { version: 7, name: "x", summary: "", notes: "" }), id);
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe("conflict");

    const notPrepared = await areaEncounters(deps).PUT(req("PUT", `areas/${id}/encounters`, { version: 1, encounterIds: [live.id] }), id);
    expect(notPrepared.status).toBe(400);
  });

  it("refuses a reward whose status belongs to the other kind, and one tied to an unlinked battle", async () => {
    const { deps, encounters } = setup();
    const stray = encounters.create("Elsewhere", null, "prepared");
    const { area } = await createArea(deps);
    const id = area.id;

    const tied = await areaRewards(deps).PUT(
      req("PUT", `areas/${id}/rewards`, { version: 1, rewards: [{ kind: "item", encounterId: stray.id, status: "planned", itemRef: { source: "srd", edition: "2014", slug: "longsword" }, quantity: 1, note: "" }] }),
      id,
    );
    expect(tied.status).toBe(400);

    const ok = await areaRewards(deps).PUT(
      req("PUT", `areas/${id}/rewards`, { version: 1, rewards: [{ kind: "item", encounterId: null, status: "planned", itemRef: { source: "srd", edition: "2014", slug: "longsword" }, quantity: 1, note: "" }] }),
      id,
    );
    const rewardId = ((await ok.json()) as AreaDetail).rewards[0].id;
    const wrong = await areaReward(deps).PATCH(req("PATCH", `areas/${id}/rewards/${rewardId}`, { status: "earned" }), id, rewardId);
    expect(wrong.status).toBe(400);
    const unknown = await areaReward(deps).PATCH(req("PATCH", `areas/${id}/rewards/${rewardId}`, { status: "nonsense" }), id, rewardId);
    expect(unknown.status).toBe(400);
  });

  it("refuses bad bodies: stray fields, a wrong type, malformed json, a large body", async () => {
    const { deps } = setup();
    const collection = areaCollection(deps);
    expect((await collection.POST(req("POST", "areas", { name: "x", summary: "", notes: "", extra: 1 }))).status).toBe(400);
    expect((await collection.POST(req("POST", "areas", { name: 5, summary: "", notes: "" }))).status).toBe(400);
    expect((await collection.POST(req("POST", "areas", { name: "x", summary: "", notes: "", campaignId: "nope" }))).status).toBe(400);
    const broken = new Request(`${BASE}/areas`, { method: "POST", body: "{nope", headers: { "x-portal-request": "1", "sec-fetch-site": "same-origin", "content-type": "application/json" } });
    expect((await collection.POST(broken)).status).toBe(400);
    const huge = await collection.POST(req("POST", "areas", { name: "x", summary: "", notes: "x".repeat(70_000) }));
    expect(huge.status).toBe(413);
    const wrongType = new Request(`${BASE}/areas`, { method: "POST", body: "name=x", headers: { "x-portal-request": "1", "sec-fetch-site": "same-origin", "content-type": "text/plain" } });
    expect((await collection.POST(wrongType)).status).toBe(415);
    expect((await collection.GET(req("GET", "areas?campaign=nope"))).status).toBe(400);
  });

  it("treats a malformed id as unknown, not as an error", async () => {
    const { deps } = setup();
    expect((await areaItem(deps).GET(req("GET", "areas/x"), "x' OR 1=1--")).status).toBe(404);
    expect((await areaEncounters(deps).PUT(req("PUT", "areas/x/encounters", { version: 1, encounterIds: [] }), "nope")).status).toBe(404);
    expect((await areaReward(deps).PATCH(req("PATCH", "areas/x/rewards/y", { status: "given" }), "nope", "nope")).status).toBe(404);
  });

  it("reorders areas", async () => {
    const { deps } = setup();
    const a = await createArea(deps, "A");
    const b = await createArea(deps, "B");
    expect((await areaOrder(deps).PUT(req("PUT", "areas/order", { ids: [b.area.id, a.area.id] }))).status).toBe(204);
    const list = await (await areaCollection(deps).GET(req("GET", "areas"))).json();
    expect(list.map((area: { name: string }) => area.name)).toEqual(["B", "A"]);
    expect((await areaOrder(deps).PUT(req("PUT", "areas/order", { ids: ["nope"] }))).status).toBe(400);
  });
});

describe("access", () => {
  const cases: [string, (deps: ReturnType<typeof setup>["deps"]) => Promise<Response>][] = [
    ["areas GET", (deps) => areaCollection(deps).GET(req("GET", "areas"))],
    ["areas POST", (deps) => areaCollection(deps).POST(req("POST", "areas", { name: "x", summary: "", notes: "" }))],
    ["areas order", (deps) => areaOrder(deps).PUT(req("PUT", "areas/order", { ids: [] }))],
    ["area GET", (deps) => areaItem(deps).GET(req("GET", "areas/x"), "x")],
    ["area DELETE", (deps) => areaItem(deps).DELETE(req("DELETE", "areas/x"), "x")],
    ["area encounters", (deps) => areaEncounters(deps).PUT(req("PUT", "areas/x/encounters", { version: 1, encounterIds: [] }), "x")],
    ["area rewards", (deps) => areaRewards(deps).PUT(req("PUT", "areas/x/rewards", { version: 1, rewards: [] }), "x")],
    ["reward status", (deps) => areaReward(deps).PATCH(req("PATCH", "areas/x/rewards/y", { status: "given" }), "x", "y")],
    ["items GET", (deps) => itemCollection(deps).GET(req("GET", "items"))],
    ["items POST", (deps) => itemCollection(deps).POST(req("POST", "items", {}))],
    ["item DELETE", (deps) => itemItem(deps).DELETE(req("DELETE", "items/x"), "x")],
    ["item search", (deps) => itemSearch(deps).GET(req("GET", "items/search?q=a"))],
    ["srd item", (deps) => srdItem(deps).GET(req("GET", "items/srd/2014/longsword"), "2014", "longsword")],
    ["creature search", (deps) => creatureSearch(deps).GET(req("GET", "creatures/search?q=a"))],
  ];

  it.each(cases)("%s: 401 without a session", async (_name, call) => {
    expect((await call(setup(null).deps)).status).toBe(401);
  });

  it.each(cases)("%s: 404 for a signed-in player who is not the DM", async (_name, call) => {
    expect((await call(setup(PLAYER).deps)).status).toBe(404);
  });

  it("refuses a request without the portal header or from another origin", async () => {
    const { deps } = setup();
    const noHeader = new Request(`${BASE}/areas`, { headers: { "sec-fetch-site": "same-origin" } });
    expect((await areaCollection(deps).GET(noHeader)).status).toBe(403);
    const crossSite = new Request(`${BASE}/areas`, { headers: { "x-portal-request": "1", "sec-fetch-site": "cross-site" } });
    expect((await areaCollection(deps).GET(crossSite)).status).toBe(403);
  });

  it("does not touch the database for a refused caller", async () => {
    const { deps, db } = setup(PLAYER);
    await areaCollection(deps).POST(req("POST", "areas", { name: "x", summary: "", notes: "" }));
    expect((db.prepare("SELECT COUNT(*) AS n FROM areas").get() as { n: number }).n).toBe(0);
  });

  it("rate limits writes", async () => {
    const { deps } = setup();
    let last = 0;
    for (let index = 0; index < 125; index++) last = (await areaOrder(deps).PUT(req("PUT", "areas/order", { ids: [] }))).status;
    expect(last).toBe(429);
  });
});

describe("item routes", () => {
  const input = { name: "Moonblade", category: "Weapon", rarity: "Rare", attunement: "", costGp: 0, weightLb: 3, detail: "", description: "" };

  it("full lifecycle for a custom item", async () => {
    const { deps, logs } = setup();
    const created = await itemCollection(deps).POST(req("POST", "items", input));
    expect(created.status).toBe(201);
    const { id } = await created.json();
    expect((await itemItem(deps).GET(req("GET", `items/${id}`), id)).status).toBe(200);
    const updated = await itemItem(deps).PUT(req("PUT", `items/${id}`, { ...input, name: "Moonblade +1" }), id);
    expect((await updated.json()).name).toBe("Moonblade +1");
    expect((await itemItem(deps).DELETE(req("DELETE", `items/${id}`), id)).status).toBe(204);
    expect((await itemItem(deps).GET(req("GET", `items/${id}`), id)).status).toBe(404);
    expect(JSON.stringify(logs)).not.toContain("Moonblade");
  });

  it("refuses bad items", async () => {
    const { deps } = setup();
    expect((await itemCollection(deps).POST(req("POST", "items", { ...input, extra: 1 }))).status).toBe(400);
    expect((await itemCollection(deps).POST(req("POST", "items", { ...input, costGp: -1 }))).status).toBe(400);
    expect((await itemCollection(deps).POST(req("POST", "items", { ...input, campaignId: "x" }))).status).toBe(400);
  });

  it("searches SRD and custom items together, by text, source and category", async () => {
    const { deps } = setup();
    await itemCollection(deps).POST(req("POST", "items", { ...input, name: "Long knife" }));
    const search = async (query: string) => (await itemSearch(deps).GET(req("GET", `items/search${query}`))).json();

    expect((await search("?q=long")).results.map((r: { name: string }) => r.name).sort()).toEqual(["Long knife", "Longsword", "Longsword"]);
    expect((await search("?q=long&source=2024")).results).toHaveLength(1);
    expect((await search("?q=long&source=custom")).results[0].ref.source).toBe("custom");
    expect((await search("?category=ring")).results.map((r: { name: string }) => r.name)).toEqual(["Ring of Protection"]);
    expect((await search("")).categories).toEqual(["Ring", "Weapon"]);
    const page = await search("?limit=2&offset=1");
    expect(page.total).toBe(4);
    expect(page.results).toHaveLength(2);
  });

  it("refuses an unknown source or campaign and caps the page size", async () => {
    const { deps } = setup();
    expect((await itemSearch(deps).GET(req("GET", "items/search?source=vom"))).status).toBe(400);
    expect((await itemSearch(deps).GET(req("GET", "items/search?campaign=nope"))).status).toBe(400);
    expect((await (await itemSearch(deps).GET(req("GET", "items/search?limit=100000"))).json()).results.length).toBeLessThanOrEqual(60);
  });

  it("serves one SRD item and 404s the rest", async () => {
    const { deps } = setup();
    const ok = await srdItem(deps).GET(req("GET", "items/srd/2014/longsword"), "2014", "longsword");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toContain("private");
    expect((await srdItem(deps).GET(req("GET", "x"), "2014", "../../etc")).status).toBe(404);
    expect((await srdItem(deps).GET(req("GET", "x"), "1999", "longsword")).status).toBe(404);
  });
});

describe("creature search", () => {
  it("finds SRD monsters and the DM's own creatures, by reference only", async () => {
    const { deps } = setup();
    deps.repo().create({ kind: "npc", statBlock: { ...goblin, name: "Goblin King Grix" }, notes: "secret plan", tags: [] });
    const response = await creatureSearch(deps).GET(req("GET", "creatures/search?q=goblin"));
    const { results } = await response.json();
    expect(results.map((entry: { name: string }) => entry.name).sort()).toEqual(["Goblin", "Goblin King Grix"]);
    // A reference and a label; no stat block and no private notes leave.
    expect(JSON.stringify(results)).not.toContain("secret plan");
    expect(results.every((entry: Record<string, unknown>) => !("statBlock" in entry))).toBe(true);
  });
});
