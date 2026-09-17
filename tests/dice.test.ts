import { describe, expect, it } from "vitest";
import { secureRng } from "@/lib/dice/random";
import { DiceError, naturalD20, parseDice, rollDice, withAdvantage } from "@/lib/dice/roll";

const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("parseDice", () => {
  it("parses dice, constants, keep/drop and percent", () => {
    expect(parseDice("2d20kh1 + 5")).toEqual([
      { kind: "dice", sign: 1, count: 2, sides: 20, keep: { mode: "kh", n: 1 } },
      { kind: "const", sign: 1, value: 5 },
    ]);
    expect(parseDice("d%-1")).toEqual([
      { kind: "dice", sign: 1, count: 1, sides: 100 },
      { kind: "const", sign: -1, value: 1 },
    ]);
    expect(parseDice("4D6DL1")[0]).toMatchObject({ count: 4, sides: 6, keep: { mode: "dl", n: 1 } });
  });

  it.each([
    [""], ["   "], ["d"], ["2d"], ["1d0"], ["1d1001"], ["101d6"], ["0d6"], ["1d20kh1"], ["2d20kh2"], ["1d20+"],
    ["abc"], ["1d20; rm -rf"], ["1d20`"], ["1+1+1+1+1+1+1+1+1+1+1"], ["1".repeat(101)], ["99999"],
  ])("rejects %j", (expression) => {
    expect(() => parseDice(expression)).toThrow(DiceError);
  });
});

describe("rollDice", () => {
  it("keeps the highest with advantage", () => {
    const result = rollDice("2d20kh1+5", sequence(18, 7));
    expect(result).toMatchObject({ total: 23, breakdown: "[18, (7)] + 5", expression: "2d20kh1+5" });
  });

  it("keeps the lowest with disadvantage and ties by position", () => {
    expect(rollDice("2d20kl1", sequence(4, 4)).breakdown).toBe("[4, (4)]");
  });

  it("drops the lowest for ability scores", () => {
    const result = rollDice("4d6dl1", sequence(3, 6, 1, 5));
    expect(result.total).toBe(14);
    expect(result.breakdown).toBe("[3, 6, (1), 5]");
  });

  it("drops the highest", () => {
    expect(rollDice("3d6dh1", sequence(6, 2, 5)).total).toBe(7);
  });

  it("handles subtraction, leading minus and multiple dice terms", () => {
    expect(rollDice("1d10 + 2d4 - 1", sequence(8, 2, 3))).toMatchObject({ total: 12, breakdown: "[8] + [2, 3] - 1" });
    expect(rollDice("-1d4+10", sequence(3))).toMatchObject({ total: 7, breakdown: "-[3] + 10" });
  });

  it("detects natural 20s and 1s on the kept die", () => {
    expect(naturalD20(rollDice("2d20kh1+5", sequence(20, 3)))).toBe(20);
    expect(naturalD20(rollDice("2d20kh1+5", sequence(1, 9)))).toBeNull();
    expect(naturalD20(rollDice("1d20", sequence(1)))).toBe(1);
    expect(naturalD20(rollDice("2d6", sequence(6, 6)))).toBeNull();
  });
});

describe("withAdvantage", () => {
  it("rewrites a single leading d20 only", () => {
    expect(withAdvantage("1d20+5", "adv")).toBe("2d20kh1+5");
    expect(withAdvantage("d20-1", "dis")).toBe("2d20kl1-1");
    expect(withAdvantage("2d6+3", "adv")).toBe("2d6+3");
    expect(withAdvantage("1d200", "adv")).toBe("1d200");
  });
});

describe("secureRng", () => {
  it("stays in range and reaches both ends", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const value = secureRng(6);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
      seen.add(value);
    }
    expect(seen.size).toBe(6);
  });

  it("rejects impossible dice", () => {
    expect(() => secureRng(0)).toThrow(RangeError);
  });
});
