import { describe, expect, it } from "vitest";
import { CreatureRepo } from "@/lib/dm/creatures";
import { openDatabase } from "@/lib/dm/db";
import { librarySource, librarySources } from "@/lib/dm/libraryRoutes";
import { LibraryPageRepo } from "@/lib/dm/libraryPages";
import { RateLimiter } from "@/lib/rateLimit";
import { goblin } from "./fixtures/goblin";
import { grantedAccess, ownerAccess } from "./helpers/access";

const DM = "111111111111111111";
const SOURCE = "ddb:mm-2024";

function setup(access = ownerAccess(DM, [DM])) {
  const db = openDatabase(":memory:");
  const creatures = new CreatureRepo(db);
  const pages = new LibraryPageRepo(db);
  creatures.upsertImported({ kind: "monster", statBlock: { ...goblin, name: "Aboleth" }, notes: "", tags: [] }, { source: SOURCE, sourceKey: "1", supersedes: "2024/aboleth" });
  creatures.upsertImported({ kind: "monster", statBlock: { ...goblin, name: "Other Book" }, notes: "", tags: [] }, { source: "ddb:xyz-2024", sourceKey: "1", supersedes: null });
  creatures.create({ kind: "monster", statBlock: { ...goblin, name: "Mine" }, notes: "", tags: [] });
  pages.put(SOURCE, "monsters-a", "<p>raw</p>");
  pages.put("ddb:xyz-2024", "monsters-a", "<p>raw</p>");
  const logs: unknown[] = [];
  const deps = { getAccess: access, limiter: new RateLimiter(), creatures: () => creatures, libraryPages: () => pages, log: (e: unknown) => logs.push(e) };
  return { creatures, pages, logs, list: librarySources(deps), item: librarySource(deps) };
}

const req = (method: string, headers: Record<string, string> = { "x-portal-request": "1", "sec-fetch-site": "same-origin" }) =>
  new Request("https://portal.example/api/dm/library/sources", { method, headers });

describe("GET /api/dm/library/sources", () => {
  it("lists each imported book with its label and count", async () => {
    const { list } = setup();
    const { sources } = await (await list.GET(req("GET"))).json();
    expect(sources).toEqual([
      { source: SOURCE, label: "Monster Manual (2024)", count: 1 },
      { source: "ddb:xyz-2024", label: "ddb:xyz-2024", count: 1 },
    ]);
  });

  it("is a 404 for a user without the dm permission, and 403 without the portal header", async () => {
    expect((await setup(grantedAccess("222222222222222222", [], [])).list.GET(req("GET"))).status).toBe(404);
    expect((await setup().list.GET(req("GET", {}))).status).toBe(403);
  });
});

describe("DELETE /api/dm/library/sources/:source", () => {
  it("removes that book's monsters and raw pages only, and audits without content", async () => {
    const { item, creatures, pages, logs } = setup();
    const response = await item.DELETE(req("DELETE"), SOURCE);
    expect(await response.json()).toEqual({ removed: 1 });
    expect(creatures.list("monster").map((c) => c.statBlock.name).sort()).toEqual(["Mine", "Other Book"]);
    expect(creatures.supersededSrd().size).toBe(0);
    expect(pages.removeSource("ddb:xyz-2024")).toBe(1);
    expect(pages.removeSource(SOURCE)).toBe(0);
    expect(JSON.stringify(logs)).toContain(SOURCE);
    expect(JSON.stringify(logs)).not.toContain("Aboleth");
  });

  it("answers 400 for a malformed source id", async () => {
    expect((await setup().item.DELETE(req("DELETE"), "../etc")).status).toBe(400);
  });

  it("is a 404 for a non-DM", async () => {
    expect((await setup(grantedAccess("222222222222222222", [], [])).item.DELETE(req("DELETE"), SOURCE)).status).toBe(404);
  });
});
