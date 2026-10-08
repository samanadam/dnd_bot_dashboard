import { describe, expect, it } from "vitest";
import type { Grant } from "@/lib/access/permissions";
import { areaCollection, areaItem } from "@/lib/dm/areaRoutes";
import { AreaRepo } from "@/lib/dm/areas";
import { creatureCollection, creatureItem } from "@/lib/dm/creatureRoutes";
import { CreatureRepo } from "@/lib/dm/creatures";
import { openDatabase } from "@/lib/dm/db";
import { encounterCampaign, encounterCollection, encounterItem, encounterLaunch } from "@/lib/dm/encounterRoutes";
import { EncounterRepo } from "@/lib/dm/encounters";
import { FeatRepo } from "@/lib/dm/feats";
import { itemCollection, itemItem, itemSearch } from "@/lib/dm/itemRoutes";
import { ItemRepo } from "@/lib/dm/items";
import { savedCollection, savedItem } from "@/lib/dm/savedRoutes";
import { SavedRepo } from "@/lib/dm/saved";
import { sceneCollection, sceneItem } from "@/lib/dm/sceneRoutes";
import { SceneRepo } from "@/lib/dm/scenes";
import { spellCollection, spellItem, spellSearch } from "@/lib/dm/spellRoutes";
import { SpellRepo } from "@/lib/dm/spells";
import { tagRoutes } from "@/lib/dm/tagRoutes";
import { TagRepo } from "@/lib/dm/tags";
import { RateLimiter } from "@/lib/rateLimit";
import { goblin } from "./fixtures/goblin";
import { grantedAccess } from "./helpers/access";

// A co-DM granted the DM tools in campaign A only. For every DM resource they
// may work in A, and everywhere else the answer is the unknown-thing 404:
// another campaign, content filed under none, and moving things out of A.

const CODM = "222222222222222222";
const ROLE = "333333333333333333";
const A = "aaaaaaaaaaaa";
const B = "bbbbbbbbbbbb";
const GRANTS: Grant[] = [{ roleId: ROLE, permissions: ["dm"], scope: [A] }];

function req(method: string, path = "", body?: unknown) {
  return new Request(`https://portal.example/api/dm/${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "x-portal-request": "1", "sec-fetch-site": "same-origin", ...(body === undefined ? {} : { "content-type": "application/json" }) },
  });
}

function setup() {
  const db = openDatabase(":memory:");
  const deps = {
    getAccess: grantedAccess(CODM, [ROLE], GRANTS),
    limiter: new RateLimiter(),
    repo: () => new CreatureRepo(db),
    encounters: () => new EncounterRepo(db),
    scenes: () => new SceneRepo(db),
    saved: () => new SavedRepo(db),
    tags: () => new TagRepo(db),
    items: () => new ItemRepo(db),
    areas: () => new AreaRepo(db),
    spells: () => new SpellRepo(db),
    feats: () => new FeatRepo(db),
    srdItems: () => ({ list: () => [], get: () => null }),
    srdSpells: () => ({ list: () => [], get: () => null }),
    srdFeats: () => ({ list: () => [], get: () => null }),
    srdMonsters: () => [],
    lookup: () => ({ item: () => null, creature: () => null }),
  };
  return { db, deps };
}

const itemBody = (campaignId: string | null) => ({ name: "Ring", category: "Ring", rarity: "", attunement: "", costGp: 0, weightLb: 0, detail: "", description: "", campaignId });
const sceneBody = (campaignId: string | null) => ({ name: "Tavern", category: "", replace: true, music: null, layers: [], campaignId });
const savedBody = (campaignId: string | null, n = 1) => ({ source: "youtube", kind: "music", ref: `abcdefghij${n}`, title: "Song", durationSeconds: null, campaignId });
const areaBody = (campaignId: string | null) => ({ name: "Cave", summary: "", notes: "", campaignId });
const spellBody = (campaignId: string | null) => ({
  name: "Spark",
  level: 0,
  school: "evocation",
  castingTime: "1 action",
  ritual: false,
  range: "60 feet",
  components: { verbal: true, somatic: false, material: false, materialText: "", materialCostGp: null, materialConsumed: false },
  duration: "Instantaneous",
  concentration: false,
  classes: [],
  attack: null,
  save: null,
  effect: null,
  scaling: null,
  description: "",
  higherLevel: "",
  campaignId,
});

type Handlers = {
  list: (deps: ReturnType<typeof setup>["deps"]) => { GET: (r: Request) => Promise<Response>; POST: (r: Request) => Promise<Response> };
  item: (deps: ReturnType<typeof setup>["deps"]) => {
    GET?: (r: Request, id: string) => Promise<Response>;
    PUT: (r: Request, id: string) => Promise<Response>;
    DELETE: (r: Request, id: string) => Promise<Response>;
  };
  body: (campaignId: string | null) => Record<string, unknown>;
  seed: (deps: ReturnType<typeof setup>["deps"], campaignId: string | null) => string;
  update?: (campaignId: string | null) => Record<string, unknown>;
};

const RESOURCES: Record<string, Handlers> = {
  npcs: {
    list: creatureCollection,
    item: creatureItem,
    body: (campaignId) => ({ kind: "npc", statBlock: goblin, notes: "", tags: [], campaignId }),
    seed: (deps, campaignId) => deps.repo().create({ kind: "npc", statBlock: goblin, notes: "", tags: [], campaignId }).id,
  },
  items: { list: itemCollection, item: itemItem, body: itemBody, seed: (deps, c) => deps.items().create(itemBody(c))!.id },
  scenes: { list: sceneCollection, item: sceneItem, body: sceneBody, seed: (deps, c) => deps.scenes().create(sceneBody(c) as never)!.id },
  saved: {
    list: savedCollection,
    item: savedItem as never,
    body: (c) => savedBody(c, 7),
    seed: (deps, c) => {
      const result = deps.saved().create(savedBody(c, c === A ? 1 : c === B ? 2 : 3) as never);
      if (!result.ok) throw new Error("seed failed");
      return result.item.id;
    },
    update: (c) => savedBody(c, 9),
  },
  spells: { list: spellCollection, item: spellItem, body: spellBody, seed: (deps, c) => deps.spells().create(spellBody(c) as never)!.id },
  encounters: {
    list: encounterCollection,
    item: encounterItem,
    body: (campaignId) => ({ name: "Ambush", campaignId }),
    seed: (deps, c) => deps.encounters().create("Ambush", c).id,
    update: () => ({ version: 1, encounter: { name: "Ambush", round: 0, turn: 0, combatants: [] } }),
  },
};

describe.each(Object.entries(RESOURCES))("a co-DM scoped to one campaign: %s", (_name, r) => {
  it("works in their campaign", async () => {
    const { deps } = setup();
    expect((await r.list(deps).POST(req("POST", "", r.body(A)))).status).toBe(201);
    const id = r.seed(deps, A);
    if (r.item(deps).GET) expect((await r.item(deps).GET!(req("GET"), id)).status).toBe(200);
    expect((await r.item(deps).PUT(req("PUT", "", r.update ? r.update(A) : r.body(A)), id)).status).toBe(200);
    expect((await r.item(deps).DELETE(req("DELETE"), id)).status).toBe(204);
  });

  it("cannot create in another campaign or under none", async () => {
    const { deps } = setup();
    expect((await r.list(deps).POST(req("POST", "", r.body(B)))).status).toBe(404);
    expect((await r.list(deps).POST(req("POST", "", r.body(null)))).status).toBe(404);
  });

  it("lists only their campaign and refuses to list others", async () => {
    const { deps } = setup();
    const mine = r.seed(deps, A);
    r.seed(deps, B);
    r.seed(deps, null);
    const all = (await (await r.list(deps).GET(req("GET"))).json()) as Array<{ id: string }>;
    expect(all.map((row) => row.id)).toEqual([mine]);
    expect((await r.list(deps).GET(req("GET", `?campaign=${B}`))).status).toBe(404);
    expect((await r.list(deps).GET(req("GET", "?campaign=unassigned"))).status).toBe(404);
  });

  it("cannot read, change or delete a row elsewhere", async () => {
    const { deps } = setup();
    for (const campaign of [B, null]) {
      const id = r.seed(deps, campaign);
      if (r.item(deps).GET) expect((await r.item(deps).GET!(req("GET"), id)).status).toBe(404);
      expect((await r.item(deps).PUT(req("PUT", "", r.update ? r.update(A) : r.body(A)), id)).status).toBe(404);
      expect((await r.item(deps).DELETE(req("DELETE"), id)).status).toBe(404);
    }
  });

  it("cannot move a row out of their campaign", async () => {
    if (r.update) return; // encounters move through their own route, below; saved links have no move
    const { deps } = setup();
    const id = r.seed(deps, A);
    expect((await r.item(deps).PUT(req("PUT", "", r.body(B)), id)).status).toBe(404);
    expect((await r.item(deps).PUT(req("PUT", "", r.body(null)), id)).status).toBe(404);
  });
});

describe("a co-DM scoped to one campaign: the rest", () => {
  it("cannot move or launch encounters across campaigns", async () => {
    const { deps } = setup();
    const mine = deps.encounters().create("Mine", A, "prepared").id;
    const theirs = deps.encounters().create("Theirs", B, "prepared").id;
    expect((await encounterCampaign(deps).PUT(req("PUT", "", { campaignId: B }), mine)).status).toBe(404);
    expect((await encounterCampaign(deps).PUT(req("PUT", "", { campaignId: A }), theirs)).status).toBe(404);
    expect((await encounterLaunch(deps).POST(req("POST"), theirs)).status).toBe(404);
    expect((await encounterLaunch(deps).POST(req("POST"), mine)).status).toBe(201);
  });

  it("reads the shared monster library but cannot change it", async () => {
    const { deps } = setup();
    const monster = deps.repo().create({ kind: "monster", statBlock: goblin, notes: "", tags: [] }).id;
    expect((await creatureItem(deps).GET(req("GET"), monster)).status).toBe(200);
    const listed = (await (await creatureCollection(deps).GET(req("GET", "?kind=monster"))).json()) as unknown[];
    expect(listed).toHaveLength(1);
    expect((await creatureCollection(deps).POST(req("POST", "", { kind: "monster", statBlock: goblin, notes: "", tags: [] }))).status).toBe(404);
    expect((await creatureItem(deps).PUT(req("PUT", "", { kind: "monster", statBlock: goblin, notes: "x", tags: [] }), monster)).status).toBe(404);
    expect((await creatureItem(deps).DELETE(req("DELETE"), monster)).status).toBe(404);
    // Nor turn an NPC of theirs into a library monster.
    const npc = deps.repo().create({ kind: "npc", statBlock: goblin, notes: "", tags: [], campaignId: A }).id;
    expect((await creatureItem(deps).PUT(req("PUT", "", { kind: "monster", statBlock: goblin, notes: "", tags: [] }), npc)).status).toBe(404);
  });

  it("searches only their campaign's custom items and spells", async () => {
    const { deps } = setup();
    deps.items().create(itemBody(A));
    deps.items().create({ ...itemBody(B), name: "Hidden" });
    const items = (await (await itemSearch(deps).GET(req("GET", "items/search?source=custom"))).json()) as { results: Array<{ name: string }> };
    expect(items.results.map((i) => i.name)).toEqual(["Ring"]);
    expect((await itemSearch(deps).GET(req("GET", `items/search?campaign=${B}`))).status).toBe(404);
    deps.spells().create({ ...spellBody(B), name: "Secret" } as never);
    const spells = (await (await spellSearch(deps).GET(req("GET", "spells/search?source=custom"))).json()) as { total: number };
    expect(spells.total).toBe(0);
  });

  it("sees and tags only saved links in their campaign; shared bucket sounds stay open", async () => {
    const { deps } = setup();
    const mine = (deps.saved().create(savedBody(A, 1) as never) as { item: { id: string } }).item.id;
    const theirs = (deps.saved().create(savedBody(B, 2) as never) as { item: { id: string } }).item.id;
    deps.tags().set(`saved:${theirs}`, ["secret"]);
    deps.tags().set(`saved:${mine}`, ["tavern"]);
    deps.tags().set("bucket:music/rain.opus", ["rain"]);
    const visible = (await (await tagRoutes(deps).GET(req("GET"))).json()) as Record<string, string[]>;
    expect(Object.keys(visible).sort()).toEqual(["bucket:music/rain.opus", `saved:${mine}`].sort());
    expect((await tagRoutes(deps).PUT(req("PUT", "", { ref: `saved:${theirs}`, tags: ["x"] }))).status).toBe(404);
    expect((await tagRoutes(deps).PUT(req("PUT", "", { ref: "bucket:music/rain.opus", tags: ["storm"] }))).status).toBe(200);
  });

  it("keeps areas to their campaign", async () => {
    const { deps } = setup();
    const theirs = deps.areas().create(areaBody(B))!.id;
    expect((await areaItem(deps).GET(req("GET"), theirs)).status).toBe(404);
    expect((await areaCollection(deps).POST(req("POST", "", areaBody(B)))).status).toBe(404);
    expect((await areaCollection(deps).POST(req("POST", "", areaBody(A)))).status).toBe(201);
  });
});
