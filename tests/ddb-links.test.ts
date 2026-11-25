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
    db.prepare("UPDATE characters SET vitals = ? WHERE id = ?").run(JSON.stringify({ ...sheet.vitals, maxHpAdjust: 5 }), sheet.id);
    const m = ok(caster);
    const saved = sheets.saveSynced(sheet.id, m.body, m.vitals, m.edition)!;
    expect(saved.version).toBe(sheet.version + 1);
    expect(saved.vitalsVersion).toBe(sheet.vitalsVersion + 1);
    expect(saved.vitals.hp).toBe(m.vitals.hp);
    expect(saved.vitals.slotsSpent.slice(0, 2)).toEqual([2, 1]);
    expect(saved.vitals.maxHpAdjust).toBe(5);
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

describe("waiting characters are bounded", () => {
  it("keeps at most 50 per player, but still updates one already waiting", () => {
    const { links } = setup();
    const camp = { id: "1", name: "C" };
    for (let i = 0; i < 60; i++) links.setPending(ARIA, String(1000 + i), "N" + i, camp, "2026-11-22T10:00:00.000Z");
    expect(links.pending(ARIA)).toHaveLength(50);
    links.setPending(ARIA, "1000", "Renamed", camp, "2026-11-22T10:05:00.000Z");
    expect(links.pending(ARIA).find((p) => p.ddbCharacterId === "1000")?.name).toBe("Renamed");
    expect(links.pending(ARIA)).toHaveLength(50);
  });
});

describe("live sync state", () => {
  it("is live while the extension says so and keeps reporting, offline once it goes quiet or says stop", () => {
    const { sheets, links, sheet } = setup();
    links.create(sheet.id, ARIA, "42", "2026-11-22T10:00:00.000Z");
    const at = (s: number) => new Date(Date.parse("2026-11-25T10:00:00.000Z") + s * 1000).toISOString();
    expect(links.isLive(ARIA, at(0))).toBe(false);
    links.setLive(ARIA, true, at(0));
    expect(links.isLive(ARIA, at(100))).toBe(true);
    expect(links.isLive(ARIA, at(151))).toBe(false);
    links.setLive(ARIA, true, at(200));
    expect(links.isLive(ARIA, at(210))).toBe(true);
    links.setLive(ARIA, false, at(220));
    expect(links.isLive(ARIA, at(221))).toBe(false);
    expect(sheets.get(sheet.id)?.sync).toMatchObject({ live: false });
  });

  it("shows on the sheet: nothing for a sheet that is not synced, live or offline plus the last sync for one that is", () => {
    const { db, sheets, links, sheet } = setup();
    expect(sheets.get(sheet.id)?.sync).toBeNull();
    links.create(sheet.id, ARIA, "42", "2026-11-22T10:00:00.000Z");
    expect(sheets.get(sheet.id)?.sync).toEqual({ live: false, syncedAt: expect.any(String) });
    links.setLive(ARIA, true, new Date().toISOString());
    expect(sheets.get(sheet.id)?.sync?.live).toBe(true);
    // Another player's live state does not leak onto this sheet.
    db.prepare("DELETE FROM ext_live WHERE user_id = ?").run(ARIA);
    links.setLive(BRAM, true, new Date().toISOString());
    expect(sheets.get(sheet.id)?.sync?.live).toBe(false);
  });
});

describe("HP changes waiting for the extension", () => {
  const want = { hp: 9, tempHp: 2, removed: 3, successes: 0, failures: 1 };
  const NOW = "2026-11-26T12:00:00.000Z";

  it("keeps the latest change per sheet and lists it for the sheet's owner with the D&D Beyond id", () => {
    const { links, sheet } = setup();
    links.create(sheet.id, ARIA, "42", "2026-11-22T10:00:00.000Z");
    links.queueWrite(sheet.id, { ...want, hp: 5, removed: 7 }, NOW);
    links.queueWrite(sheet.id, want, NOW);
    expect(links.writeFor(sheet.id, Date.parse(NOW))).toEqual(want);
    expect(links.pendingWrites(ARIA, Date.parse(NOW))).toEqual([{ ddbCharacterId: "42", ...want }]);
    expect(links.pendingWrites(BRAM, Date.parse(NOW))).toEqual([]);
  });

  it("forgets a change once saved, and ignores one older than ten minutes", () => {
    const { links, sheet } = setup();
    links.create(sheet.id, ARIA, "42", "2026-11-22T10:00:00.000Z");
    links.queueWrite(sheet.id, want, NOW);
    links.clearWrite(sheet.id);
    expect(links.writeFor(sheet.id, Date.parse(NOW))).toBeNull();
    links.queueWrite(sheet.id, want, NOW);
    const later = Date.parse(NOW) + 11 * 60_000;
    expect(links.writeFor(sheet.id, later)).toBeNull();
    expect(links.pendingWrites(ARIA, later)).toEqual([]);
  });

  it("does nothing for a sheet that is not synced", () => {
    const { links, sheet } = setup();
    links.queueWrite(sheet.id, want, NOW);
    expect(links.pendingWrites(ARIA, Date.parse(NOW))).toEqual([]);
  });
});
