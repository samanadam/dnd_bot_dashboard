import type { RolledDice } from "@/lib/dice/roll";
import { shownDice, type ShownDie } from "@/lib/dice/shown";

// D&D Beyond's game-log roll message (see tests/fixtures/ddb/rolls.json) as the
// portal's own dice want it. D&D Beyond decides the numbers; we only show them.

export type DdbRoll = { ddbCharacterId: string; label: string; expression: string; total: number; breakdown: string; dice: ShownDie[] };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

function termsOf(notation: Obj): RolledDice[] {
  return list(notation.set).flatMap((entry) => {
    const set = obj(entry);
    const sides = Number(/^d(\d+)$/.exec(str(set.dieType, 8))?.[1]);
    if (!Number.isInteger(sides)) return [];
    const dice = list(set.dice).map(obj);
    return [
      {
        kind: "dice" as const,
        sign: 1 as const,
        count: dice.length,
        sides,
        rolls: dice.map((d) => (typeof d.dieValue === "number" ? d.dieValue : 0)),
        kept: dice.map((d) => d.useInTotal !== false),
        subtotal: 0,
      },
    ];
  });
}

/** Every finished roll in a D&D Beyond message (an attack and its damage come together), or none. */
export function parseRolls(message: unknown): DdbRoll[] {
  const m = obj(message);
  if (m.eventType !== "dice/roll/fulfilled" || m.entityType !== "character") return [];
  const data = obj(m.data);
  const action = str(data.action, 60);
  return list(data.rolls).flatMap((entry) => {
    const roll = obj(entry);
    const result = obj(roll.result);
    if (typeof result.total !== "number" || !Number.isFinite(result.total)) return [];
    const expression = str(roll.diceNotationStr, 100);
    if (!expression) return [];
    const type = str(roll.rollType, 20);
    return [
      {
        ddbCharacterId: String(m.entityId ?? ""),
        label: (action && type ? `${action}: ${type}` : action || type || "Roll").slice(0, 80),
        expression,
        total: Math.trunc(result.total),
        breakdown: str(result.text, 200),
        dice: shownDice(termsOf(obj(roll.diceNotation))),
      },
    ];
  });
}
