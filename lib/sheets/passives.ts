// Which passive scores the DM's party cards show. Kept per device (see useLocalValue):
// nothing stored means all three; "none" means the DM turned every one off.

export const PASSIVES = ["perception", "investigation", "insight"] as const;
export type Passive = (typeof PASSIVES)[number];

export const PASSIVE_LABELS: Record<Passive, string> = { perception: "Perception", investigation: "Investigation", insight: "Insight" };

/** The passives to show for a stored choice, always in the same order. */
export function shownPassives(stored: string): Passive[] {
  if (stored === "") return [...PASSIVES];
  const wanted = new Set(stored.split(","));
  return PASSIVES.filter((p) => wanted.has(p));
}

/** What to store after turning `which` on or off. */
export function togglePassive(current: readonly Passive[], which: Passive): string {
  const next = PASSIVES.filter((p) => (p === which ? !current.includes(p) : current.includes(p)));
  return next.length === 0 ? "none" : next.join(",");
}
