// Pure helpers for the calendar page: how the days are laid out, which are the
// best, and the weekday shortcut. No React, so the tests run them directly.

const at = (day: string) => new Date(`${day}T12:00:00Z`);

/** Monday-first column of a day (0 = Monday, 6 = Sunday). */
export const column = (day: string): number => (at(day).getUTCDay() + 6) % 7;

export type MonthBlock = { key: string; label: string; /** One entry per grid cell: a day, or null for padding. */ cells: (string | null)[] };

const monthName = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });

/** The days grouped by month, each block padded so days sit under their weekday. */
export function monthBlocks(days: readonly string[]): MonthBlock[] {
  const blocks: MonthBlock[] = [];
  for (const day of days) {
    const key = day.slice(0, 7);
    let block = blocks[blocks.length - 1];
    if (!block || block.key !== key) {
      block = { key, label: monthName.format(at(day)), cells: Array.from({ length: column(day) }, () => null) };
      blocks.push(block);
    }
    block.cells.push(day);
  }
  return blocks;
}

/** Share of the players who are free, 0 to 1. */
export const heat = (count: number, total: number): number => (total > 0 ? Math.min(1, count / total) : 0);

export type BestDay = { day: string; count: number; missing: string[] };

/**
 * The best upcoming days: most players free first, earliest on ties. Today and
 * past days are never offered, and with fewer than two players there is nothing
 * to agree on.
 */
export function bestDays(input: { today: string; counts: Readonly<Record<string, number>>; who: Readonly<Record<string, string[]>>; players: readonly string[] }, limit: number): BestDay[] {
  const { today, counts, who, players } = input;
  if (players.length < 2) return [];
  return Object.keys(counts)
    .filter((day) => day > today && counts[day] > 0)
    .sort((a, b) => counts[b] - counts[a] || a.localeCompare(b))
    .slice(0, limit)
    .map((day) => ({ day, count: counts[day], missing: players.filter((name) => !(who[day] ?? []).includes(name)) }));
}

/**
 * Tick every upcoming day on this weekday, or untick them all when they are all
 * ticked already. Days before today are left exactly as they were.
 */
export function toggleWeekday(mine: readonly string[], days: readonly string[], today: string, weekday: number): string[] {
  const target = days.filter((day) => day >= today && column(day) === weekday);
  const have = new Set(mine);
  const allOn = target.length > 0 && target.every((day) => have.has(day));
  for (const day of target) {
    if (allOn) have.delete(day);
    else have.add(day);
  }
  return [...have].sort();
}
