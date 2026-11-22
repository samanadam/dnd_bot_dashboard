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
    db.prepare("UPDATE characters SET vitals = ? WHERE id = ?").run(JSON.stringify({ ...sheet.vitals, hitDiceSpent: { 6: 0, 8: 1, 10: 0, 12: 0 } }), sheet.id);
    const m = ok(caster);
    const saved = sheets.saveSynced(sheet.id, m.body, m.vitals, m.edition)!;
    expect(saved.version).toBe(sheet.version + 1);
    expect(saved.vitalsVersion).toBe(sheet.vitalsVersion + 1);
    expect(saved.vitals.hp).toBe(m.vitals.hp);
    expect(saved.vitals.slotsSpent.slice(0, 2)).toEqual([2, 1]);
    expect(saved.vitals.hitDiceSpent[8]).toBe(1);
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

describe("campaigns of synced characters", () => {
  const TYR = "bbbbbbbbbbbb";

  it("remembers which portal campaign a D&D Beyond campaign means, per player", () => {
    const { links } = setup();
    expect(links.mappedCampaign(ARIA, "8266155")).toBeNull();
    links.mapCampaign(ARIA, "8266155", TYR);
    expect(links.mappedCampaign(ARIA, "8266155")).toBe(TYR);
    expect(links.mappedCampaign(BRAM, "8266155")).toBeNull();
    links.mapCampaign(ARIA, "8266155", EMBER);
    expect(links.mappedCampaign(ARIA, "8266155")).toBe(EMBER);
  });

  it("keeps the D&D Beyond campaign on the link and shows it in the status", () => {
    const { links, sheet } = setup();
    links.create(sheet.id, ARIA, "42", "2026-11-22T10:00:00.000Z", { id: "8266155", name: "Tyranny of Dragons" });
    expect(links.status(ARIA)[0]).toMatchObject({ ddbCampaignId: "8266155", ddbCampaignName: "Tyranny of Dragons" });
    links.setDdbCampaign(sheet.id, { id: "7", name: "Other" });
    expect(links.status(ARIA)[0]).toMatchObject({ ddbCampaignId: "7", ddbCampaignName: "Other" });
    expect(links.sheetsOfDdbCampaign(ARIA, "7")).toEqual([sheet.id]);
    expect(links.sheetsOfDdbCampaign(ARIA, "8266155")).toEqual([]);
  });

  it("lists characters waiting for a campaign choice, and forgets them once placed", () => {
    const { links } = setup();
    links.setPending(ARIA, "42", "Auren", { id: "8266155", name: "Tyranny of Dragons" }, "2026-11-22T10:00:00.000Z");
    links.setPending(ARIA, "42", "Auren Solvane", { id: "8266155", name: "Tyranny of Dragons" }, "2026-11-22T10:01:00.000Z");
    expect(links.pending(ARIA)).toEqual([{ ddbCharacterId: "42", name: "Auren Solvane", ddbCampaignId: "8266155", ddbCampaignName: "Tyranny of Dragons", seenAt: "2026-11-22T10:01:00.000Z" }]);
    expect(links.pending(BRAM)).toEqual([]);
    links.clearPending(ARIA, "42");
    expect(links.pending(ARIA)).toEqual([]);
  });

  it("moves a sheet to another campaign, keeping its vitals and link, and gives up the active flag if the player already has one there", () => {
    const { sheets, links, sheet } = setup();
    links.create(sheet.id, ARIA, "42", "2026-11-22T10:00:00.000Z");
    const other = sheets.create({ campaignId: TYR, ownerUserId: ARIA, edition: "2024", name: "Other Test" });
    if (other === "limit") throw new Error("limit");
    expect(other.active).toBe(true);
    const moved = sheets.moveToCampaign(sheet.id, TYR)!;
    expect(moved.campaignId).toBe(TYR);
    expect(moved.active).toBe(false);
    expect(moved.vitals).toEqual(sheet.vitals);
    expect(sheets.isSynced(sheet.id)).toBe(true);
    expect(sheets.activeFor(TYR, ARIA)?.id).toBe(other.id);
    expect(sheets.moveToCampaign("00000000-0000-4000-8000-000000000000", TYR)).toBeNull();
    // Moving to where it already is changes nothing.
    expect(sheets.moveToCampaign(sheet.id, TYR)!.campaignId).toBe(TYR);
  });

  it("finds the sheets of characters in no D&D Beyond campaign by the reserved key", () => {
    const { links, sheet } = setup();
    links.create(sheet.id, ARIA, "42", "2026-11-22T10:00:00.000Z");
    expect(links.sheetsOfDdbCampaign(ARIA, "none")).toEqual([sheet.id]);
    expect(links.sheetsOfDdbCampaign(ARIA, "8266155")).toEqual([]);
    expect(links.sheetsOfDdbCampaign(BRAM, "none")).toEqual([]);
  });

  it("an active sheet stays active in a campaign where the player has none", () => {
    const { sheets, sheet } = setup();
    expect(sheet.active).toBe(true);
    expect(sheets.moveToCampaign(sheet.id, TYR)!.active).toBe(true);
  });
});
