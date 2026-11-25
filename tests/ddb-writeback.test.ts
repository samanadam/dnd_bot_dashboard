import { describe, expect, it } from "vitest";
import { desiredWrite, isFresh, matches, onlyWriteBack, WRITE_TTL_MS } from "@/lib/ddb/writeBack";
import { newVitals } from "@/lib/sheets/vitals";

describe("which portal changes go back to D&D Beyond", () => {
  it("takes HP, temp HP and death saves", () => {
    expect(onlyWriteBack([{ op: "damage", amount: 3 }, { op: "heal", amount: 1 }, { op: "setTemp", tempHp: 4, mode: "max" }])).toBe(true);
    expect(onlyWriteBack([{ op: "setHp", hp: 5 }, { op: "deathSave", result: "failure" }, { op: "resetDeathSaves" }])).toBe(true);
  });

  it("refuses anything else, even mixed in", () => {
    expect(onlyWriteBack([{ op: "addCondition", name: "Prone", rounds: null }])).toBe(false);
    expect(onlyWriteBack([{ op: "damage", amount: 1 }, { op: "inspiration", value: true }])).toBe(false);
    expect(onlyWriteBack([{ op: "stabilize" }])).toBe(false);
    expect(onlyWriteBack([])).toBe(false);
  });
});

describe("what D&D Beyond should hold", () => {
  it("turns the sheet's HP into D&D Beyond's damage taken, with temp HP and death saves", () => {
    const vitals = { ...newVitals(12), hp: 9, tempHp: 2, deathSaves: { successes: 1, failures: 2 } };
    expect(desiredWrite(vitals, 12)).toEqual({ hp: 9, tempHp: 2, removed: 3, successes: 1, failures: 2 });
  });

  it("never asks for negative damage taken", () => {
    expect(desiredWrite({ ...newVitals(10), hp: 14 }, 10).removed).toBe(0);
  });

  it("matches when D&D Beyond holds it, ignoring everything else", () => {
    const want = desiredWrite({ ...newVitals(12), hp: 9, tempHp: 2 }, 12);
    const extra = { ...newVitals(12), hp: 9, tempHp: 2, inspiration: true };
    expect(matches(want, extra)).toBe(true);
    expect(matches(want, { ...newVitals(12), hp: 10, tempHp: 2 })).toBe(false);
    expect(matches(want, { ...newVitals(12), hp: 9, tempHp: 0 })).toBe(false);
    expect(matches(want, { ...newVitals(12), hp: 9, tempHp: 2, deathSaves: { successes: 0, failures: 1 } })).toBe(false);
  });

  it("stops waiting after ten minutes, so D&D Beyond wins again", () => {
    const now = Date.parse("2026-11-26T12:00:00.000Z");
    expect(isFresh(new Date(now - WRITE_TTL_MS + 1000).toISOString(), now)).toBe(true);
    expect(isFresh(new Date(now - WRITE_TTL_MS - 1000).toISOString(), now)).toBe(false);
  });
});
