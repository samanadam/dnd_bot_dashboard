import { describe, expect, it } from "vitest";
import { CreatureRepo } from "@/lib/dm/creatures";
import { openDatabase } from "@/lib/dm/db";
import { importMonsterPage, LibraryFull, nameKey, NoStatBlocks } from "@/lib/dm/libraryImport";
import { LibraryPageRepo } from "@/lib/dm/libraryPages";
import type { MonsterSummary } from "@/lib/dm/monsterSummary";
import { feature, pageHtml, section, statBlockHtml } from "./fixtures/ddb-pages";

const SOURCE = "ddb:mm-2024";
const srdEntry = (name: string, edition: "2014" | "2024", slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-")): MonsterSummary => ({
  id: `srd-${edition}:${slug}`, slug, edition, kind: "monster", name, cr: "1", type: "Dragon", size: "Medium", hp: 10, ac: 10,
});

function setup(srd: MonsterSummary[] = []) {
  const db = openDatabase(":memory:");
  const creatures = new CreatureRepo(db);
  const pages = new LibraryPageRepo(db);
  const run = (html: string, extra: { dryRun?: boolean; edition?: "2014" | "2024" } = {}) =>
    importMonsterPage({ creatures, pages, srd: () => srd }, { source: SOURCE, edition: extra.edition ?? "2024", page: "monsters-a", html, dryRun: extra.dryRun ?? false });
  return { creatures, pages, run };
}
const page = (...names: string[]) => pageHtml(names.map((name, i) => statBlockHtml({ name, id: String(9000 + i) })));

describe("nameKey", () => {
  it("keeps lowercase letters and digits only", () => {
    expect(nameKey("Yuan-ti Malison (Type 1)")).toBe("yuantimalisontype1");
  });
});

describe("importMonsterPage", () => {
  it("replaces an SRD monster of the same edition, remembering which one", () => {
    const { creatures, run } = setup([srdEntry("Ember Drake", "2024")]);
    const ledger = run(page("Ember Drake", "Cinder Imp"));
    expect(ledger).toMatchObject({ received: 2, created: 2, updated: 0, superseding: 1, needsReview: [] });
    expect(creatures.supersededSrd()).toEqual(new Set(["2024/ember-drake"]));
    expect(creatures.list("monster").map((c) => [c.statBlock.name, c.supersedes])).toEqual([["Ember Drake", "2024/ember-drake"], ["Cinder Imp", null]]);
  });

  it("does not replace an SRD monster of the other edition", () => {
    const { creatures, run } = setup([srdEntry("Ember Drake", "2014")]);
    expect(run(page("Ember Drake")).superseding).toBe(0);
    expect(creatures.supersededSrd().size).toBe(0);
  });

  it("sends an ambiguous SRD match to review and writes nothing for it", () => {
    const { creatures, run } = setup([srdEntry("Ember Drake", "2024", "ember-drake"), srdEntry("Ember-Drake", "2024", "ember-drake-b")]);
    const ledger = run(page("Ember Drake", "Cinder Imp"));
    expect(ledger.needsReview).toEqual([{ name: "Ember Drake", reason: expect.stringMatching(/more than one/i) }]);
    expect(ledger).toMatchObject({ received: 2, created: 1 });
    expect(creatures.list("monster").map((c) => c.statBlock.name)).toEqual(["Cinder Imp"]);
  });

  it("is idempotent: a second run updates, never duplicates", () => {
    const { creatures, run } = setup([srdEntry("Ember Drake", "2024")]);
    run(page("Ember Drake", "Cinder Imp"));
    const again = run(page("Ember Drake", "Cinder Imp"));
    expect(again).toMatchObject({ received: 2, created: 0, updated: 2, superseding: 1 });
    expect(creatures.list("monster")).toHaveLength(2);
  });

  it("writes nothing on a dry run but reports the same counts", () => {
    const { creatures, pages, run } = setup([srdEntry("Ember Drake", "2024")]);
    const dry = run(page("Ember Drake", "Cinder Imp"), { dryRun: true });
    expect(creatures.list("monster")).toEqual([]);
    expect(pages.totalBytes()).toBe(0);
    expect(run(page("Ember Drake", "Cinder Imp"))).toEqual(dry);
  });

  it("reports updates on a dry run after a real one", () => {
    const { run } = setup();
    run(page("Ember Drake"));
    expect(run(page("Ember Drake", "Cinder Imp"), { dryRun: true })).toMatchObject({ created: 1, updated: 1 });
  });

  it("stores the raw page on a real run", () => {
    const { pages, run } = setup();
    const html = page("Ember Drake");
    run(html);
    expect(pages.totalBytes()).toBe(Buffer.byteLength(html));
  });

  it("puts an unreadable block in review and still imports the rest", () => {
    const { creatures, run } = setup();
    const html = pageHtml([
      statBlockHtml({ name: "Wordy", id: "1", body: section("Actions") + feature("Long", "x".repeat(4100)) }),
      statBlockHtml({ name: "Fine", id: "2" }),
    ]);
    const ledger = run(html);
    expect(ledger).toMatchObject({ received: 2, created: 1 });
    expect(ledger.needsReview).toEqual([{ name: "Wordy", reason: expect.stringContaining("desc") }]);
    expect(creatures.list("monster").map((c) => c.statBlock.name)).toEqual(["Fine"]);
  });

  it("counts every stat block on the page as received", () => {
    const { run } = setup();
    const ledger = run(page("A One", "B Two", "C Three"));
    expect(ledger.received).toBe(3);
    expect(ledger.created + ledger.updated + ledger.needsReview.length).toBe(ledger.received);
  });

  it("refuses a page with no stat blocks", () => {
    const { creatures, pages, run } = setup();
    expect(() => run("<div class='p-article-content'><p>hi</p></div>")).toThrow(NoStatBlocks);
    expect(creatures.list("monster")).toEqual([]);
    expect(pages.totalBytes()).toBe(0);
  });

  it("refuses to store a page that would pass the library cap", () => {
    const db = openDatabase(":memory:");
    const pages = new LibraryPageRepo(db);
    const creatures = new CreatureRepo(db);
    const html = page("Ember Drake");
    expect(() => importMonsterPage({ creatures, pages, srd: () => [], maxLibraryBytes: html.length - 1 }, { source: SOURCE, edition: "2024", page: "p", html, dryRun: false })).toThrow(LibraryFull);
    expect(creatures.list("monster")).toEqual([]);
  });
});

describe.runIf(process.env.DDB_PAGES_DIR)("captured pages against the real SRD (local only)", () => {
  it("imports every page, is idempotent, and removing the book frees the SRD entries", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { listSrd } = await import("@/lib/dm/srd");
    const dir = process.env.DDB_PAGES_DIR as string;
    const { creatures, pages, run } = setup(listSrd());
    const files = readdirSync(dir).filter((f) => f.endsWith(".html"));
    const totals = { received: 0, created: 0, updated: 0, superseding: 0, review: 0 };
    const pass = () => {
      const t = { received: 0, created: 0, updated: 0, superseding: 0, review: 0 };
      for (const file of files) {
        const ledger = run(readFileSync(join(dir, file), "utf8"));
        t.received += ledger.received; t.created += ledger.created; t.updated += ledger.updated; t.superseding += ledger.superseding; t.review += ledger.needsReview.length;
      }
      return t;
    };
    Object.assign(totals, pass());
    console.log("first run", totals);
    expect(totals.received).toBe(totals.created + totals.review);
    expect(totals.review).toBe(0);
    const again = pass();
    expect(again).toMatchObject({ received: totals.received, created: 0, updated: totals.received, superseding: totals.superseding });
    expect(creatures.list("monster")).toHaveLength(totals.received);
    expect(creatures.supersededSrd().size).toBe(totals.superseding);
    expect(creatures.removeSource(SOURCE)).toBe(totals.received);
    pages.removeSource(SOURCE);
    expect(creatures.supersededSrd().size).toBe(0);
  });
});
