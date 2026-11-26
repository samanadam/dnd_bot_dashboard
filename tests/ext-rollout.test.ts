import { describe, expect, it } from "vitest";
import { ddbRollFrame, type OutRoll } from "@/extension/src/rollOut";
import { parseRolls } from "@/extension/src/rolls";

const ctx = { gameId: "8266155", userId: "122333583", dmUserId: "100200300", name: "Auren", now: Date.parse("2026-11-26T19:00:00.000Z"), messageId: "m-1", rollId: "r-1" };
const roll = (over: Partial<OutRoll> = {}): OutRoll => ({
  id: "x",
  ddbCharacterId: "173706203",
  label: "Stealth",
  expression: "1d20+5",
  total: 19,
  breakdown: "14 + 5",
  dice: [{ kind: 20, face: 14, kept: true }],
  visibility: "everyone",
  ...over,
});

describe("ddbRollFrame (a portal roll as D&D Beyond's game-log message)", () => {
  it("builds a finished roll to the game, which the extension's own reader reads back the same", () => {
    const frame = ddbRollFrame(roll(), ctx)!;
    expect(frame).toMatchObject({ id: "m-1", gameId: "8266155", userId: "122333583", messageScope: "gameId", messageTarget: "8266155", entityId: "173706203", entityType: "character", eventType: "dice/roll/fulfilled", dateTime: String(ctx.now) });
    const [back] = parseRolls(frame);
    expect(back).toMatchObject({ ddbCharacterId: "173706203", label: "Stealth: roll", expression: "1d20+5", total: 19, visibility: "everyone", dice: [{ kind: 20, face: 14, kept: true }] });
  });

  it("sends a DM-only roll to the campaign's DM, and none when the DM is not known", () => {
    const frame = ddbRollFrame(roll({ visibility: "dm" }), ctx)!;
    expect(frame).toMatchObject({ messageScope: "userId", messageTarget: "100200300" });
    expect(parseRolls(frame)[0].visibility).toBe("dm");
    expect(ddbRollFrame(roll({ visibility: "dm" }), { ...ctx, dmUserId: null })).toBeNull();
  });

  it("groups dice by size, keeps dropped dice as not counted, and works out the constant", () => {
    const frame = ddbRollFrame(roll({ expression: "2d20kh1+3", total: 18, dice: [{ kind: 20, face: 5, kept: false }, { kind: 20, face: 15, kept: true }] }), ctx)!;
    const [back] = parseRolls(frame);
    expect(back.dice).toEqual([{ kind: 20, face: 5, kept: false }, { kind: 20, face: 15, kept: true }]);
    const data = (frame as { data: { rolls: Array<{ diceNotation: { constant: number; set: Array<{ count: number; dieType: string }> } }> } }).data;
    expect(data.rolls[0].diceNotation.constant).toBe(3);
    expect(data.rolls[0].diceNotation.set).toEqual([expect.objectContaining({ count: 2, dieType: "d20" })]);
  });

  it("turns the portal's two d100 dice back into one d100", () => {
    const frame = ddbRollFrame(roll({ expression: "1d100", total: 70, dice: [{ kind: 100, face: 7, kept: true }, { kind: 10, face: 0, kept: true }] }), ctx)!;
    const data = (frame as { data: { rolls: Array<{ diceNotation: { set: Array<{ dieType: string; dice: Array<{ dieValue: number }> }> } }> } }).data;
    expect(data.rolls[0].diceNotation.set).toEqual([expect.objectContaining({ dieType: "d100", dice: [expect.objectContaining({ dieValue: 70 })] })]);
  });

  it("gives nothing without the game and the player's D&D Beyond ids", () => {
    expect(ddbRollFrame(roll(), { ...ctx, gameId: "" })).toBeNull();
    expect(ddbRollFrame(roll(), { ...ctx, userId: "" })).toBeNull();
  });
});
