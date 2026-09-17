import { secureRng, type Rng } from "./random";

// Dice notation: terms joined by + or -, each either NdS (optionally with
// kh/kl/dh/dl N) or a constant. Examples: 1d20+5, 2d20kh1+3, 4d6dl1, 8d6, d%.

export type KeepMode = "kh" | "kl" | "dh" | "dl";
export type DiceTerm = { kind: "dice"; sign: 1 | -1; count: number; sides: number; keep?: { mode: KeepMode; n: number } };
export type ConstTerm = { kind: "const"; sign: 1 | -1; value: number };
export type Term = DiceTerm | ConstTerm;
export type RolledDice = DiceTerm & { rolls: number[]; kept: boolean[]; subtotal: number };
export type RolledConst = ConstTerm & { subtotal: number };
export type RolledTerm = RolledDice | RolledConst;
export type RollResult = { expression: string; total: number; terms: RolledTerm[]; breakdown: string };

export class DiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiceError";
  }
}

export const DICE_LIMITS = { length: 100, terms: 10, dice: 100, sides: 1000, constant: 10_000 } as const;

const TERM = /^(\d{0,3})d(\d{1,4})(?:(kh|kl|dh|dl)(\d{1,3}))?$|^(\d{1,5})$/;

export function normaliseDice(expression: string): string {
  return expression.toLowerCase().replace(/\s+/g, "").replace(/d%/g, "d100");
}

export function parseDice(expression: string): Term[] {
  if (expression.trim().length === 0 || expression.length > DICE_LIMITS.length) {
    throw new DiceError("Enter dice like 1d20+5 (up to 100 characters).");
  }
  const text = normaliseDice(expression);
  if (!/^[0-9dkhl+-]+$/.test(text)) throw new DiceError("Use dice notation like 2d6+3, 2d20kh1 or 4d6dl1.");
  const parts = text.match(/[+-]?[^+-]+/g);
  if (!parts || parts.join("") !== text || /[+-]$/.test(text)) throw new DiceError("The expression is incomplete.");
  if (parts.length > DICE_LIMITS.terms) throw new DiceError(`Use at most ${DICE_LIMITS.terms} terms.`);

  return parts.map((part): Term => {
    const sign: 1 | -1 = part.startsWith("-") ? -1 : 1;
    const body = part.replace(/^[+-]/, "");
    const match = TERM.exec(body);
    if (!match) throw new DiceError(`"${body.slice(0, 20)}" is not a die or a number.`);
    if (match[5] !== undefined) {
      const value = Number(match[5]);
      if (value > DICE_LIMITS.constant) throw new DiceError("That number is too large.");
      return { kind: "const", sign, value };
    }
    const count = match[1] === "" ? 1 : Number(match[1]);
    const sides = Number(match[2]);
    if (count < 1 || count > DICE_LIMITS.dice) throw new DiceError(`Roll 1 to ${DICE_LIMITS.dice} dice at a time.`);
    if (sides < 1 || sides > DICE_LIMITS.sides) throw new DiceError(`Dice need 1 to ${DICE_LIMITS.sides} sides.`);
    const term: DiceTerm = { kind: "dice", sign, count, sides };
    if (match[3]) {
      const n = Number(match[4]);
      // Keeping or dropping every die (or none) is never what was meant.
      if (n < 1 || n >= count) throw new DiceError("Keep or drop fewer dice than you roll, e.g. 2d20kh1.");
      term.keep = { mode: match[3] as KeepMode, n };
    }
    return term;
  });
}

function keptFlags(rolls: number[], keep: DiceTerm["keep"]): boolean[] {
  if (!keep) return rolls.map(() => true);
  const ascending = rolls.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value || a.index - b.index);
  const descending = [...ascending].reverse();
  const chosen =
    keep.mode === "kh" ? descending.slice(0, keep.n)
    : keep.mode === "kl" ? ascending.slice(0, keep.n)
    : keep.mode === "dl" ? ascending.slice(keep.n)
    : descending.slice(keep.n);
  const kept = rolls.map(() => false);
  for (const { index } of chosen) kept[index] = true;
  return kept;
}

export function formatBreakdown(terms: RolledTerm[]): string {
  return terms
    .map((term, index) => {
      const op = index === 0 ? (term.sign < 0 ? "-" : "") : term.sign < 0 ? " - " : " + ";
      const body =
        term.kind === "const"
          ? String(term.value)
          : `[${term.rolls.map((value, i) => (term.kept[i] ? String(value) : `(${value})`)).join(", ")}]`;
      return `${op}${body}`;
    })
    .join("")
    .slice(0, 300);
}

export function rollDice(expression: string, rng: Rng = secureRng): RollResult {
  const terms = parseDice(expression);
  const rolled: RolledTerm[] = terms.map((term) => {
    if (term.kind === "const") return { ...term, subtotal: term.sign * term.value };
    const rolls = Array.from({ length: term.count }, () => rng(term.sides));
    const kept = keptFlags(rolls, term.keep);
    const sum = rolls.reduce((acc, value, index) => acc + (kept[index] ? value : 0), 0);
    return { ...term, rolls, kept, subtotal: term.sign * sum };
  });
  return {
    expression: normaliseDice(expression),
    total: rolled.reduce((acc, term) => acc + term.subtotal, 0),
    terms: rolled,
    breakdown: formatBreakdown(rolled),
  };
}

/** "1d20+5" -> "2d20kh1+5". Anything that is not a single leading d20 is unchanged. */
export function withAdvantage(expression: string, mode: "adv" | "dis"): string {
  const text = normaliseDice(expression);
  const match = /^1?d20(?![0-9kd])/.exec(text);
  if (!match) return text;
  return `2d20${mode === "adv" ? "kh1" : "kl1"}${text.slice(match[0].length)}`;
}

/** A natural 20 or 1 on the first d20 that counted. */
export function naturalD20(result: RollResult): 20 | 1 | null {
  const first = result.terms.find((term): term is RolledDice => term.kind === "dice" && term.sides === 20);
  if (!first) return null;
  const value = first.rolls.find((_, index) => first.kept[index]);
  return value === 20 ? 20 : value === 1 ? 1 : null;
}
