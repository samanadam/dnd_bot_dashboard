import { describe, expect, it } from "vitest";
import { CreatureRepo, type CreatureInput } from "@/lib/dm/creatures";
import { migrate, openDatabase, SCHEMA_VERSION } from "@/lib/dm/db";
import { LibraryPageRepo } from "@/lib/dm/libraryPages";
import { DatabaseSync } from "node:sqlite";
import { goblin } from "./fixtures/goblin";

const SOURCE = "ddb:mm-2024";
const input = (name: string): CreatureInput => ({ kind: "monster", statBlock: { ...goblin, name }, notes: "", tags: [] });
const origin = (key: string, supersedes: string | null = null) => ({ source: SOURCE, sourceKey: key, supersedes });

describe("imported creatures", () => {
  it("upserts by (source, sourceKey): created, then updated, never a second row", () => {
    const repo = new CreatureRepo(openDatabase(":memory:"));
    expect(repo.upsertImported(input("Ember Drake"), origin("1"))).toBe("created");
    expect(repo.upsertImported(input("Ember Drake Elder"), origin("1"))).toBe("updated");
    const rows = repo.list("monster");
    expect(rows).toHaveLength(1);
    expect(rows[0].statBlock.name).toBe("Ember Drake Elder");
    expect(rows[0]).toMatchObject({ source: SOURCE, sourceKey: "1", supersedes: null });
  });

  it("lists sources with counts and removes only that source", () => {
    const repo = new CreatureRepo(openDatabase(":memory:"));
    repo.upsertImported(input("A"), origin("1"));
    repo.upsertImported(input("B"), origin("2"));
    repo.create(input("Mine"));
    expect(repo.listSources()).toEqual([{ source: SOURCE, count: 2 }]);
    expect(repo.removeSource(SOURCE)).toBe(2);
    expect(repo.list("monster").map((c) => c.statBlock.name)).toEqual(["Mine"]);
    expect(repo.listSources()).toEqual([]);
  });

  it("reports the SRD entries an import supersedes, and forgets them on removal", () => {
    const repo = new CreatureRepo(openDatabase(":memory:"));
    repo.upsertImported(input("Aboleth"), origin("1", "2024/aboleth"));
    repo.upsertImported(input("Plain"), origin("2"));
    expect([...repo.supersededSrd()]).toEqual(["2024/aboleth"]);
    repo.removeSource(SOURCE);
    expect(repo.supersededSrd().size).toBe(0);
  });

  it("creates ordinary creatures with no source", () => {
    const repo = new CreatureRepo(openDatabase(":memory:"));
    expect(repo.create(input("Mine"))).toMatchObject({ source: null, sourceKey: null, supersedes: null });
  });

  it("keeps rows from the previous schema readable after migrating", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db, SCHEMA_VERSION - 1);
    db.prepare("INSERT INTO creatures (id, kind, name, data, campaign_id, created_at, updated_at) VALUES (?, 'monster', 'Old', ?, NULL, 't', 't')").run(
      "11111111-1111-4111-8111-111111111111",
      JSON.stringify({ statBlock: { ...goblin, name: "Old" }, notes: "", tags: [] }),
    );
    migrate(db);
    expect(new CreatureRepo(db).list("monster").map((c) => c.statBlock.name)).toEqual(["Old"]);
  });
});

describe("LibraryPageRepo", () => {
  it("keeps one row per (source, page) and counts bytes", () => {
    const pages = new LibraryPageRepo(openDatabase(":memory:"));
    pages.put(SOURCE, "monsters-a", "x".repeat(10));
    pages.put(SOURCE, "monsters-a", "y".repeat(25));
    pages.put(SOURCE, "monsters-b", "z");
    expect(pages.totalBytes()).toBe(26);
    expect(pages.removeSource(SOURCE)).toBe(2);
    expect(pages.totalBytes()).toBe(0);
  });
});
