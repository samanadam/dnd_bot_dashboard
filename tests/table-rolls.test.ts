import { describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/dm/db";
import { MAX_TABLE_ROLLS, TableRollRepo, type NewTableRoll } from "@/lib/play/tableRolls";

const EMBER = "aaaaaaaaaaaa";
const OTHER = "bbbbbbbbbbbb";
const ARIA = "100000000000000002";
const BRAM = "100000000000000003";

const roll = (over: Partial<NewTableRoll> = {}): NewTableRoll => ({
  campaignId: EMBER,
  userId: ARIA,
  sheetId: null,
  who: "Auren",
  label: "Dagger: to hit",
  expression: "1d20+5",
  total: 17,
  breakdown: "12 + 5",
  visibility: "everyone",
  source: "portal",
  ...over,
});

function setup() {
  let clock = Date.parse("2026-11-26T12:00:00.000Z");
  const repo = new TableRollRepo(openDatabase(":memory:"), () => new Date((clock += 1000)));
  return { repo };
}

describe("table rolls", () => {
  it("lists a campaign's rolls newest first, with where they came from", () => {
    const { repo } = setup();
    repo.add(roll({ label: "first", source: "ddb" }));
    repo.add(roll({ label: "second" }));
    repo.add(roll({ campaignId: OTHER, label: "elsewhere" }));
    const rolls = repo.list(EMBER, { userId: BRAM, seesAll: false });
    expect(rolls.map((r) => [r.label, r.source])).toEqual([
      ["second", "portal"],
      ["first", "ddb"],
    ]);
    expect(rolls[0]).toMatchObject({ who: "Auren", expression: "1d20+5", total: 17, breakdown: "12 + 5", visibility: "everyone", mine: false });
  });

  it("shows a DM-only roll to the DM and to the one who rolled it, and to nobody else", () => {
    const { repo } = setup();
    repo.add(roll({ label: "secret", visibility: "dm" }));
    expect(repo.list(EMBER, { userId: BRAM, seesAll: false })).toEqual([]);
    expect(repo.list(EMBER, { userId: ARIA, seesAll: false }).map((r) => [r.label, r.mine])).toEqual([["secret", true]]);
    expect(repo.list(EMBER, { userId: "dm", seesAll: true }).map((r) => r.label)).toEqual(["secret"]);
  });

  it("keeps only the latest rolls of each campaign, and limits a listing", () => {
    const { repo } = setup();
    for (let i = 0; i < MAX_TABLE_ROLLS + 5; i++) repo.add(roll({ label: `r${i}` }));
    repo.add(roll({ campaignId: OTHER }));
    const all = repo.list(EMBER, { userId: ARIA, seesAll: true }, 1000);
    expect(all).toHaveLength(MAX_TABLE_ROLLS);
    expect(all[0].label).toBe(`r${MAX_TABLE_ROLLS + 4}`);
    expect(repo.list(OTHER, { userId: ARIA, seesAll: true })).toHaveLength(1);
    expect(repo.list(EMBER, { userId: ARIA, seesAll: true }, 10)).toHaveLength(10);
  });
});
