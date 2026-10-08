import { describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/dm/db";
import { FeatRepo } from "@/lib/dm/feats";
import { featItem, featSearch, spellCollection, spellItem, spellSearch, srdFeat, srdSpell } from "@/lib/dm/spellRoutes";
import { SpellRepo, type CustomSpellInput, type SpellBlock } from "@/lib/dm/spells";
import type { SrdSpellSummary } from "@/lib/dm/srdSpells";
import { RateLimiter } from "@/lib/rateLimit";
import { ownerAccess } from "./helpers/access";

const DM = "111111111111111111";
const PLAYER = "222222222222222222";
const CAMPAIGN = "0123456789ab";
const BASE = "https://portal.example/api/dm";

const summary = (over: Partial<SrdSpellSummary> & Pick<SrdSpellSummary, "slug" | "name">): SrdSpellSummary => ({
  edition: "2024",
  level: 1,
  school: "evocation",
  castingTime: "1 action",
  concentration: false,
  ritual: false,
  classes: ["Wizard"],
  ...over,
});

const srdList: SrdSpellSummary[] = [
  summary({ slug: "fire-bolt", name: "Fire Bolt", level: 0, classes: ["Sorcerer", "Wizard"] }),
  summary({ slug: "bless", name: "Bless", level: 1, school: "enchantment", concentration: true, classes: ["Cleric", "Paladin"] }),
  summary({ slug: "detect-magic", name: "Detect Magic", level: 1, school: "divination", concentration: true, ritual: true, classes: ["Bard", "Wizard"] }),
  summary({ slug: "fireball", name: "Fireball", level: 3 }),
  summary({ slug: "fireball", name: "Fireball", level: 3, edition: "2014" }),
];

const block: SpellBlock = {
  name: "Fireball",
  level: 3,
  school: "evocation",
  castingTime: "1 action",
  ritual: false,
  range: "150 feet",
  components: { verbal: true, somatic: true, material: true, materialText: "bat guano", materialCostGp: null, materialConsumed: false },
  duration: "Instantaneous",
  concentration: false,
  classes: ["Wizard"],
  attack: null,
  save: "dex",
  effect: { kind: "damage", roll: "8d6", types: ["fire"] },
  scaling: { by: "slot", steps: [{ at: 4, roll: "9d6" }] },
  description: "A bright streak.",
  higherLevel: "",
};

const custom: CustomSpellInput = { ...block, name: "Frostfire", school: "evocation", level: 2, classes: ["Druid"] };

function setup(user: string | null = DM) {
  const db = openDatabase(":memory:");
  const logs: unknown[] = [];
  const deps = {
    getAccess: ownerAccess(user, [DM]),
    limiter: new RateLimiter(),
    spells: () => new SpellRepo(db),
    feats: () => new FeatRepo(db),
    srdSpells: () => ({ list: () => srdList, get: (edition: "2014" | "2024", slug: string) => (edition === "2024" && slug === "fireball" ? block : null) }),
    srdFeats: () => ({
      list: () => [{ edition: "2024" as const, slug: "alert", name: "Alert", category: "Origin", prerequisite: "" }],
      get: (edition: "2014" | "2024", slug: string) =>
        edition === "2024" && slug === "alert" ? { name: "Alert", category: "Origin", prerequisite: "", repeatable: false, description: "" } : null,
    }),
    log: (entry: unknown) => logs.push(entry),
  };
  return { db, logs, deps };
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

async function search(deps: ReturnType<typeof setup>["deps"], query: string) {
  const response = await spellSearch(deps).GET(req("GET", `spells/search?${query}`));
  return { status: response.status, body: (await response.json()) as { total: number; results: Array<{ name: string; level: number; ref: unknown }>; classes: string[] } };
}

describe("spell routes: the guard", () => {
  it("refuses no session, a non-DM, a cross-origin call and a flood", async () => {
    expect((await spellSearch(setup(null).deps).GET(req("GET", "spells/search"))).status).toBe(401);
    expect((await spellSearch(setup(PLAYER).deps).GET(req("GET", "spells/search"))).status).toBe(404);
    expect((await spellSearch(setup().deps).GET(req("GET", "spells/search", undefined, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    const { deps } = setup();
    let last = 200;
    for (let i = 0; i < 260; i++) last = (await spellSearch(deps).GET(req("GET", "spells/search"))).status;
    expect(last).toBe(429);
  });
});

describe("spell search", () => {
  it("lists SRD and custom together, cantrips first", async () => {
    const { deps } = setup();
    deps.spells().create({ ...custom, campaignId: CAMPAIGN });
    const { body } = await search(deps, "");
    expect(body.total).toBe(6);
    expect(body.results[0].name).toBe("Fire Bolt");
    expect(body.classes).toEqual(["Bard", "Cleric", "Druid", "Paladin", "Sorcerer", "Wizard"]);
  });

  it("filters by text, level, school, class, concentration, ritual and source", async () => {
    const { deps } = setup();
    deps.spells().create(custom);
    const names = async (q: string) => (await search(deps, q)).body.results.map((r) => r.name);
    expect(await names("q=fire")).toEqual(["Fire Bolt", "Frostfire", "Fireball", "Fireball"]);
    expect(await names("level=0")).toEqual(["Fire Bolt"]);
    expect(await names("level=0,2")).toEqual(["Fire Bolt", "Frostfire"]);
    expect(await names("school=divination")).toEqual(["Detect Magic"]);
    expect(await names("class=cleric")).toEqual(["Bless"]);
    expect(await names("concentration=true")).toEqual(["Bless", "Detect Magic"]);
    expect(await names("ritual=true&class=wizard")).toEqual(["Detect Magic"]);
    expect(await names("concentration=false&level=3&source=2014")).toEqual(["Fireball"]);
    expect(await names("source=custom")).toEqual(["Frostfire"]);
  });

  it("refuses bad filter values instead of matching everything", async () => {
    const { deps } = setup();
    for (const q of ["level=10", "level=a", "level=1,,2", "school=chronurgy", "concentration=yes", "ritual=1", "source=tob", "campaign=nope", `class=${"x".repeat(41)}`]) {
      expect((await search(deps, q)).status, q).toBe(400);
    }
  });

  it("pages", async () => {
    const { deps } = setup();
    const page = await search(deps, "limit=2&offset=1");
    expect(page.body.total).toBe(5);
    expect(page.body.results.map((r) => r.name)).toEqual(["Bless", "Detect Magic"]);
  });
});

describe("custom spells", () => {
  it("creates, reads, updates, shares and deletes, logging each write", async () => {
    const { deps, logs } = setup();
    const created = await spellCollection(deps).POST(req("POST", "spells", { ...custom, campaignId: CAMPAIGN }));
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect((await spellItem(deps).GET(req("GET", `spells/${id}`), id)).status).toBe(200);
    expect((await spellItem(deps).PUT(req("PUT", `spells/${id}`, { ...custom, name: "Frostfire II" }), id)).status).toBe(200);
    const shared = await spellItem(deps).PATCH(req("PATCH", `spells/${id}`, { shared: false }), id);
    expect(((await shared.json()) as { shared: boolean }).shared).toBe(false);
    expect((await spellItem(deps).DELETE(req("DELETE", `spells/${id}`), id)).status).toBe(204);
    expect((await spellItem(deps).GET(req("GET", `spells/${id}`), id)).status).toBe(404);
    expect(logs).toHaveLength(4);
  });

  it("refuses a bad body, a stray share field and a malformed id", async () => {
    const { deps } = setup();
    expect((await spellCollection(deps).POST(req("POST", "spells", { ...custom, level: 12 }))).status).toBe(400);
    expect((await spellCollection(deps).POST(req("POST", "spells", "x", { "content-type": "text/plain" }))).status).toBe(415);
    const id = deps.spells().create(custom)!.id;
    expect((await spellItem(deps).PATCH(req("PATCH", `spells/${id}`, { shared: true, extra: 1 }), id)).status).toBe(400);
    expect((await spellItem(deps).GET(req("GET", "spells/x"), "' OR 1=1")).status).toBe(404);
  });

  it("answers 409 at the limit", async () => {
    const { deps, db } = setup();
    const insert = db.prepare("INSERT INTO spells (id, name, campaign_id, data, created_at, updated_at) VALUES (?, 'x', NULL, '{}', '', '')");
    for (let i = 0; i < 1000; i++) insert.run(`id-${i}`);
    expect((await spellCollection(deps).POST(req("POST", "spells", custom))).status).toBe(409);
  });
});

describe("SRD entries", () => {
  it("serves one with a private cache header and 404s the rest", async () => {
    const { deps } = setup();
    const ok = await srdSpell(deps).GET(req("GET", "spells/srd/2024/fireball"), "2024", "fireball");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("private, max-age=3600");
    expect((await srdSpell(deps).GET(req("GET", "spells/srd/2099/fireball"), "2099", "fireball")).status).toBe(404);
    expect((await srdSpell(deps).GET(req("GET", "spells/srd/2024/nope"), "2024", "nope")).status).toBe(404);
    expect((await srdFeat(deps).GET(req("GET", "feats/srd/2024/alert"), "2024", "alert")).status).toBe(200);
    expect((await srdSpell(setup(PLAYER).deps).GET(req("GET", "x"), "2024", "fireball")).status).toBe(404);
  });
});

describe("feat routes", () => {
  it("searches by category and source, and manages custom feats", async () => {
    const { deps } = setup();
    deps.feats().create({ name: "Moonsworn", category: "General", prerequisite: "", repeatable: false, description: "" });
    const list = async (q: string) =>
      ((await (await featSearch(deps).GET(req("GET", `feats/search?${q}`))).json()) as { results: Array<{ name: string }>; categories: string[] });
    expect((await list("")).results.map((f) => f.name)).toEqual(["Alert", "Moonsworn"]);
    expect((await list("category=origin")).results.map((f) => f.name)).toEqual(["Alert"]);
    expect((await list("source=custom")).categories).toEqual(["General"]);
    expect((await featSearch(deps).GET(req("GET", "feats/search?source=x"))).status).toBe(400);
    const id = deps.feats().list()[0].id;
    expect((await featItem(deps).DELETE(req("DELETE", `feats/${id}`), id)).status).toBe(204);
  });
});
