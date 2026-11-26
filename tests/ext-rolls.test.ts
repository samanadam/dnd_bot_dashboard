import { describe, expect, it } from "vitest";
import sample from "./fixtures/ddb/rolls.json";
import { parseRolls } from "@/extension/src/rolls";
import { MAX_SHOWN } from "@/lib/dice/shown";

type Message = typeof sample;

const withRoll = (roll: unknown): Message => ({ ...sample, data: { ...sample.data, rolls: [roll as never] } });
const d100 = (value: number) => ({
  diceNotationStr: "1d100",
  rollType: "roll",
  rollKind: "",
  diceNotation: { set: [{ count: 1, dieType: "d100", operation: 0, dice: [{ dieType: "d100", dieValue: value, useInTotal: true }] }], constant: 0 },
  result: { constant: 0, values: [value], total: value, text: String(value) },
});

describe("parseRolls", () => {
  it("reads every roll of a D&D Beyond roll message", () => {
    const rolls = parseRolls(sample);
    expect(rolls).toHaveLength(2);
    expect(rolls[0]).toEqual({
      ddbCharacterId: "100000002",
      label: "Dagger: to hit",
      expression: "1d20+4",
      total: 18,
      breakdown: "14+4",
      dice: [{ kind: 20, face: 14, kept: true }],
      visibility: "everyone",
    });
    expect(rolls[1]).toMatchObject({ label: "Dagger: damage", total: 5, dice: [{ kind: 4, face: 3, kept: true }] });
  });

  it("throws a d100 as a tens die and a d10", () => {
    const [roll] = parseRolls(withRoll(d100(70)));
    expect(roll.dice).toEqual([
      { kind: 100, face: 7, kept: true },
      { kind: 10, face: 0, kept: true },
    ]);
  });

  it("marks dice that do not count as not kept", () => {
    const advantage = {
      ...d100(0),
      diceNotationStr: "2d20kh1",
      diceNotation: {
        set: [
          {
            count: 2,
            dieType: "d20",
            operation: 0,
            dice: [
              { dieType: "d20", dieValue: 5, useInTotal: false },
              { dieType: "d20", dieValue: 17, useInTotal: true },
            ],
          },
        ],
        constant: 0,
      },
      result: { constant: 0, values: [17], total: 17, text: "17" },
    };
    expect(parseRolls(withRoll(advantage))[0].dice).toEqual([
      { kind: 20, face: 5, kept: false },
      { kind: 20, face: 17, kept: true },
    ]);
  });

  it("ignores anything that is not a finished roll of a character", () => {
    expect(parseRolls(null)).toEqual([]);
    expect(parseRolls({})).toEqual([]);
    expect(parseRolls({ ...sample, eventType: "dice/roll/pending" })).toEqual([]);
    expect(parseRolls({ ...sample, entityType: "monster" })).toEqual([]);
    expect(parseRolls(withRoll({ diceNotationStr: "1d20" }))).toEqual([]);
    expect(parseRolls(withRoll({ ...d100(1), result: { total: "many" } }))).toEqual([]);
  });

  it("shows at most MAX_SHOWN dice", () => {
    const many = Array.from({ length: 30 }, () => ({ dieType: "d6", dieValue: 3, useInTotal: true }));
    const big = { ...d100(0), diceNotationStr: "30d6", diceNotation: { set: [{ count: 30, dieType: "d6", operation: 0, dice: many }], constant: 0 }, result: { constant: 0, values: [], total: 90, text: "90" } };
    expect(parseRolls(withRoll(big))[0].dice).toHaveLength(MAX_SHOWN);
  });
});

describe("who a D&D Beyond roll is for", () => {
  it("is everyone for a roll to the game", () => {
    expect(parseRolls(sample).map((r) => r.visibility)).toEqual(["everyone", "everyone"]);
  });

  it("is the DM for a roll sent to another user, and self for one sent to the roller", () => {
    expect(parseRolls({ ...sample, messageScope: "userId", messageTarget: "999" })[0].visibility).toBe("dm");
    expect(parseRolls({ ...sample, messageScope: "userId", messageTarget: sample.userId })[0].visibility).toBe("self");
  });

  it("keeps an unknown scope private", () => {
    expect(parseRolls({ ...sample, messageScope: "somethingNew" })[0].visibility).toBe("dm");
  });
});
