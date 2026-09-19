// The dice picker: tap dice and a bonus, get a notation string. It builds text
// and nothing else, so the ordinary parser and roller still decide what is
// valid and how it is rolled. Everything built here is inside their limits.

export const DIE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
export const MAX_PER_DIE = 20;
export const MAX_BONUS = 99;

export type Tray = { dice: Readonly<Record<number, number>>; bonus: number };

export const emptyTray: Tray = { dice: {}, bonus: 0 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function addDie(tray: Tray, sides: number): Tray {
  if (!(DIE_SIDES as readonly number[]).includes(sides)) return tray;
  const count = clamp((tray.dice[sides] ?? 0) + 1, 0, MAX_PER_DIE);
  return { ...tray, dice: { ...tray.dice, [sides]: count } };
}

export function removeDie(tray: Tray, sides: number): Tray {
  const count = (tray.dice[sides] ?? 0) - 1;
  const dice: Record<number, number> = { ...tray.dice };
  if (count > 0) dice[sides] = count;
  else delete dice[sides];
  return { ...tray, dice };
}

export function addBonus(tray: Tray, delta: number): Tray {
  return { ...tray, bonus: clamp(tray.bonus + delta, -MAX_BONUS, MAX_BONUS) };
}

export function isEmpty(tray: Tray): boolean {
  return Object.keys(tray.dice).length === 0;
}

/** "2d6+1d20+3", smallest die first. Empty when no die has been picked. */
export function toExpression(tray: Tray): string {
  const parts = DIE_SIDES.filter((sides) => (tray.dice[sides] ?? 0) > 0).map((sides) => `${tray.dice[sides]}d${sides}`);
  if (parts.length === 0) return "";
  const bonus = tray.bonus === 0 ? "" : tray.bonus > 0 ? `+${tray.bonus}` : `${tray.bonus}`;
  return `${parts.join("+")}${bonus}`;
}
