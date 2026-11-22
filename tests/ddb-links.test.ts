import { describe, expect, it } from "vitest";
import caster from "./fixtures/ddb/caster.json";
import { DdbLinkRepo } from "@/lib/ddb/links";
import { mapCharacter } from "@/lib/ddb/map";
import { openDatabase } from "@/lib/dm/db";
import { SheetRepo } from "@/lib/sheets/repo";

const ARIA = "100000000000000002";
const BRAM = "100000000000000003";
const EMBER = "aaaaaaaaaaaa";

function setup() {
  const db = openDatabase(":memory:");
  const sheets = new SheetRepo(db);
  const links = new DdbLinkRepo(db);
  const sheet = sheets.create({ campaignId: EMBER, ownerUserId: ARIA, edition: "2024", name: "Aria Test" });
  if (sheet === "limit") throw new Error("limit");
  return { db, sheets, links, sheet };
}

const ok = (raw: unknown) => {
  const result = mapCharacter(raw);
  if (!result.ok) throw new Error(result.reason);
  return result.mapped;
};

describe("synced sheets", () => {
  it("knows a sheet is synced once it has a link", () => {
    const { sheets, links, sheet } = setup();
    expect(sheets.isSynced(sheet.id)).toBe(false);
    links.create(sheet.id, ARIA, "100000000000000002", "2026-11-22T10:00:00.000Z");
    expect(sheets.isSynced(sheet.id)).toBe(true);
  });

  it("finds a link only for its own user and character", () => {
    const { links, sheet } = setup();
    links.create(sheet.id, ARIA, "42", "2026-11-22T10:00:00.000Z");
    expect(links.find(ARIA, "42")).toEqual({ sheetId: sheet.id, capturedAt: "2026-11-22T10:00:00.000Z" });
    expect(links.find(BRAM, "42")).toBeNull();
    expect(links.find(ARIA, "43")).toBeNull();
  });

  it("saveSynced replaces body and vitals, bumps both versions, keeps untouched vitals", () => {
    const { db, sheets, links, sheet } = setup();
    links.create(sheet.id, ARIA, "42", "2026-11-22T10:00:00.000Z");
    db.prepare("UPDATE characters SET vitals = ? WHERE id = ?").run(JSON.stringify({ ...sheet.vitals, resourcesUsed: { r1: 1 } }), sheet.id);
    const m = ok(caster);
    const saved = sheets.saveSynced(sheet.id, m.body, m.vitals, m.edition)!;
    expect(saved.version).toBe(sheet.version + 1);
    expect(saved.vitalsVersion).toBe(sheet.vitalsVersion + 1);
    expect(saved.vitals.hp).toBe(m.vitals.hp);
    expect(saved.vitals.slotsSpent.slice(0, 2)).toEqual([2, 1]);
    expect(saved.vitals.resourcesUsed).toEqual({ r1: 1 });
    expect(saved.edition).toBe(m.edition);
    expect(saved.name).toBe("Aria Test");
  });

  it("saveSynced leaves a sheet alone when nothing changed", () => {
    const { sheets, sheet } = setup();
    const m = ok(caster);
    const first = sheets.saveSynced(sheet.id, m.body, m.vitals, m.edition)!;
    const again = sheets.saveSynced(sheet.id, m.body, m.vitals, m.edition)!;
    expect(again.version).toBe(first.version);
    expect(again.vitalsVersion).toBe(first.vitalsVersion);
  });

  it("saveSynced answers null for a sheet that is gone", () => {
    const { sheets } = setup();
    const m = ok(caster);
    expect(sheets.saveSynced("00000000-0000-4000-8000-000000000000", m.body, m.vitals, m.edition)).toBeNull();
  });

  it("deleting the sheet deletes its link", () => {
    const { sheets, links, sheet } = setup();
    links.create(sheet.id, ARIA, "42", "2026-11-22T10:00:00.000Z");
    sheets.remove(sheet.id);
    expect(links.find(ARIA, "42")).toBeNull();
  });

  it("records errors and sync status per user", () => {
    const { links, sheet } = setup();
    links.create(sheet.id, ARIA, "42", "2026-11-22T10:00:00.000Z");
    links.setError(sheet.id, "unreadable");
    expect(links.status(ARIA)).toMatchObject([{ sheetId: sheet.id, ddbCharacterId: "42", lastError: "unreadable" }]);
    links.touch(sheet.id, "2026-11-22T10:05:00.000Z");
    const [status] = links.status(ARIA);
    expect(status.lastError).toBeNull();
    expect(links.find(ARIA, "42")?.capturedAt).toBe("2026-11-22T10:05:00.000Z");
    expect(links.status(BRAM)).toEqual([]);
  });
});
