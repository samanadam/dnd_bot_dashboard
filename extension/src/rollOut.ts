import type { ShownDie } from "@/lib/dice/shown";

// A portal roll as the finished-roll message D&D Beyond's own page sends to its game log
// (the shape read in rolls.ts, see tests/fixtures/ddb/rolls.json), so it shows there too.

export type OutRoll = { id: string; ddbCharacterId: string; label: string; expression: string; total: number; breakdown: string; dice: ShownDie[]; visibility: "everyone" | "dm" };
export type FrameContext = { gameId: string; userId: string; dmUserId: string | null; name: string; now: number; messageId: string; rollId: string };

type DdbDie = { dieType: string; dieValue: number; useInTotal: boolean };

/** The portal's shown dice as D&D Beyond's dice: a d10 face 0 is a 10, a d100 is its tens die plus the d10 after it. */
function ddbDice(shown: ShownDie[]): DdbDie[] {
  const dice: DdbDie[] = [];
  for (let i = 0; i < shown.length; i++) {
    const die = shown[i];
    if (die.kind === 100 && shown[i + 1]?.kind === 10) {
      const value = die.face * 10 + shown[i + 1].face;
      dice.push({ dieType: "d100", dieValue: value === 0 ? 100 : value, useInTotal: die.kept });
      i++;
    } else dice.push({ dieType: `d${die.kind}`, dieValue: die.kind === 10 && die.face === 0 ? 10 : die.face, useInTotal: die.kept });
  }
  return dice;
}

/** The message, or null when it cannot be addressed (no game, no player id, or a DM-only roll with no known DM). */
export function ddbRollFrame(roll: OutRoll, ctx: FrameContext): object | null {
  if (!ctx.gameId || !ctx.userId) return null;
  const target = roll.visibility === "dm" ? ctx.dmUserId : ctx.gameId;
  if (!target) return null;
  const dice = ddbDice(roll.dice);
  const sets: Array<{ count: number; dieType: string; operation: number; dice: DdbDie[] }> = [];
  for (const die of dice) {
    const last = sets.at(-1);
    if (last && last.dieType === die.dieType) {
      last.dice.push(die);
      last.count += 1;
    } else sets.push({ count: 1, dieType: die.dieType, operation: 0, dice: [die] });
  }
  const counted = dice.filter((d) => d.useInTotal).map((d) => d.dieValue);
  const constant = roll.total - counted.reduce((n, v) => n + v, 0);
  return {
    id: ctx.messageId,
    dateTime: String(ctx.now),
    gameId: ctx.gameId,
    userId: ctx.userId,
    source: "web",
    persist: true,
    messageScope: roll.visibility === "dm" ? "userId" : "gameId",
    messageTarget: target,
    entityId: roll.ddbCharacterId,
    entityType: "character",
    eventType: "dice/roll/fulfilled",
    data: {
      action: roll.label.slice(0, 60),
      setId: "basic",
      rollId: ctx.rollId,
      context: { entityId: roll.ddbCharacterId, entityType: "character", name: ctx.name },
      rolls: [
        {
          diceNotationStr: roll.expression.slice(0, 100),
          rollType: "roll",
          rollKind: "",
          diceNotation: { set: sets, constant },
          result: { constant, values: counted, total: roll.total, text: roll.breakdown.slice(0, 200) },
        },
      ],
    },
  };
}
