import type { RolledTerm } from "./roll";

// The dice a roll throws on screen. A d100 is thrown the way it is at the
// table: a tens die (00-90) and a d10 (0-9), with 00 + 0 meaning 100.

export const DIE_KINDS = [4, 6, 8, 10, 12, 20, 100] as const;
export type DieKind = (typeof DIE_KINDS)[number];
/** `face` is the number printed on the face that lands: 0-9 on a d10, the tens digit on a d100. */
export type ShownDie = { kind: DieKind; face: number; kept: boolean };

export const MAX_SHOWN = 20;

const isKind = (sides: number): sides is DieKind => (DIE_KINDS as readonly number[]).includes(sides);

export function shownDice(terms: RolledTerm[]): ShownDie[] {
  const dice: ShownDie[] = [];
  for (const term of terms) {
    if (term.kind !== "dice" || !isKind(term.sides)) continue;
    term.rolls.forEach((value, index) => {
      const kept = term.kept[index];
      if (term.sides === 100) dice.push({ kind: 100, face: Math.floor((value % 100) / 10), kept }, { kind: 10, face: value % 10, kept });
      else dice.push({ kind: term.sides as DieKind, face: term.sides === 10 ? value % 10 : value, kept });
    });
  }
  return dice.slice(0, MAX_SHOWN);
}
