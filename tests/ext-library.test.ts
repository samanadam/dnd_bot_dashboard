import { describe, expect, it } from "vitest";
import { UserRepo } from "@/lib/access/grants";
import { CreatureRepo } from "@/lib/dm/creatures";
import { openDatabase } from "@/lib/dm/db";
import { LibraryPageRepo } from "@/lib/dm/libraryPages";
import type { MonsterSummary } from "@/lib/dm/monsterSummary";
import { DdbLinkRepo } from "@/lib/ddb/links";
import { extLibraryPages, type ExtDeps } from "@/lib/ext/routes";
import { ExtTokenRepo } from "@/lib/ext/tokens";
import { RateLimiter } from "@/lib/rateLimit";
import { SheetRepo } from "@/lib/sheets/repo";
import { pageHtml, statBlockHtml } from "./fixtures/ddb-pages";

const DM = "100000000000000001";
const PLAYER = "100000000000000002";
const srd: MonsterSummary = { id: "srd-2024:ember-drake", slug: "ember-drake", edition: "2024", kind: "monster", name: "Ember Drake", cr: "1", type: "Dragon", size: "Medium", hp: 1, ac: 1 };

function setup() {
  const db = openDatabase(":memory:");
  const users = new UserRepo(db);
  users.upsert(DM, "Dungeon Master", null, []);
  users.upsert(PLAYER, "Player", null, []);
  const tokens = new ExtTokenRepo(db);
  const logs: unknown[] = [];
  const deps: ExtDeps = {
    tokens: () => tokens,
    links: () => new DdbLinkRepo(db),
    sheets: () => new SheetRepo(db),
    users: () => users,
    campaignsOf: async () => [],
    limiter: new RateLimiter(),
    badTokenLimiter: new RateLimiter(),
    libraryLimiter: new RateLimiter(),
    isDm: (userId) => userId === DM,
    creatures: () => new CreatureRepo(db),
    libraryPages: () => new LibraryPageRepo(db),
    srdMonsters: () => [srd],
    log: (entry) => logs.push(entry),
  };
  return { db, deps, logs, creatures: new CreatureRepo(db), pages: new LibraryPageRepo(db), dmToken: tokens.issue(DM, "", "dm").token, playerToken: tokens.issue(PLAYER, "", "player").token };
}

const body = (html: string, extra: Record<string, unknown> = {}) => ({ source: "ddb:mm-2024", edition: "2024", page: "monsters-a", html, ...extra });
const post = (token: string | null, payload: unknown) =>
  new Request("https://portal.example/api/ext/library/pages", {
    method: "POST",
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
const page = pageHtml([statBlockHtml({ name: "Ember Drake", id: "1" }), statBlockHtml({ name: "Cinder Imp", id: "2" })]);

describe("POST /api/ext/library/pages", () => {
  it("imports a page for a DM token and reports the ledger", async () => {
    const { deps, dmToken, creatures } = setup();
    const response = await extLibraryPages(deps).POST(post(dmToken, body(page)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ledger: { received: 2, created: 2, updated: 0, superseding: 1, needsReview: [] } });
    expect(creatures.list("monster")).toHaveLength(2);
    expect(creatures.supersededSrd()).toEqual(new Set(["2024/ember-drake"]));
  });

  it("writes nothing on a dry run", async () => {
    const { deps, dmToken, creatures, pages } = setup();
    const response = await extLibraryPages(deps).POST(post(dmToken, body(page, { dryRun: true })));
    expect((await response.json()).ledger.created).toBe(2);
    expect(creatures.list("monster")).toEqual([]);
    expect(pages.totalBytes()).toBe(0);
  });

  it("changes nothing the second time", async () => {
    const { deps, dmToken, creatures } = setup();
    await extLibraryPages(deps).POST(post(dmToken, body(page)));
    const again = await (await extLibraryPages(deps).POST(post(dmToken, body(page)))).json();
    expect(again.ledger).toMatchObject({ created: 0, updated: 2 });
    expect(creatures.list("monster")).toHaveLength(2);
  });

  it("answers a non-DM token like an unknown URL and writes nothing", async () => {
    const { deps, playerToken, creatures } = setup();
    const response = await extLibraryPages(deps).POST(post(playerToken, body(page)));
    expect(response.status).toBe(404);
    expect(creatures.list("monster")).toEqual([]);
  });

  it("answers 401 without a token or with a wrong one", async () => {
    const { deps } = setup();
    expect((await extLibraryPages(deps).POST(post(null, body(page)))).status).toBe(401);
    expect((await extLibraryPages(deps).POST(post("ptx_" + "a".repeat(43), body(page)))).status).toBe(401);
  });

  it("answers 413 for a body over the page cap", async () => {
    const { deps, dmToken } = setup();
    expect((await extLibraryPages(deps).POST(post(dmToken, body("x".repeat(3 * 1024 * 1024))))).status).toBe(413);
  });

  it("answers 422 for HTML with no stat blocks and writes nothing", async () => {
    const { deps, dmToken, pages } = setup();
    const response = await extLibraryPages(deps).POST(post(dmToken, body("<p>hello</p>")));
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("no_stat_blocks");
    expect(pages.totalBytes()).toBe(0);
  });

  it("answers 400 for an unknown field, a bad source or a bad edition", async () => {
    const { deps, dmToken } = setup();
    for (const extra of [{ surprise: 1 }, { source: "mm-2024" }, { edition: "2025" }, { page: "../x" }]) {
      expect((await extLibraryPages(deps).POST(post(dmToken, body(page, extra)))).status, JSON.stringify(extra)).toBe(400);
    }
  });

  it("limits a token to 60 pages a minute", async () => {
    const { deps, dmToken } = setup();
    for (let i = 0; i < 60; i++) expect((await extLibraryPages(deps).POST(post(dmToken, body(page, { dryRun: true })))).status).toBe(200);
    expect((await extLibraryPages(deps).POST(post(dmToken, body(page, { dryRun: true })))).status).toBe(429);
  });

  it("audits counts and the source, never the page or a monster name", async () => {
    const { deps, dmToken, logs } = setup();
    await extLibraryPages(deps).POST(post(dmToken, body(page)));
    expect(logs).toHaveLength(1);
    const text = JSON.stringify(logs[0]);
    expect(text).toContain("ddb:mm-2024");
    expect(text).toContain("created=2");
    expect(text).not.toContain("Ember Drake");
    expect(text).not.toContain("stat-block");
  });
});
