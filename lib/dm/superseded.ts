import type { Creature } from "./creatures";
import { summarise, type MonsterSummary } from "./monsterSummary";

// Imported book monsters replace the bundled SRD entry of the same name: the SRD
// twin is hidden from every list but stays resolvable by reference, so an
// encounter that already points at it keeps working.

const BOOKS: Record<string, string> = { "ddb:mm-2024": "Monster Manual (2024)" };

export const sourceLabel = (source: string): string => BOOKS[source] ?? source;

/** The SRD list minus the entries (edition/slug) an imported monster replaces. */
export function withoutSuperseded(srd: MonsterSummary[], hidden: ReadonlySet<string>): MonsterSummary[] {
  return hidden.size === 0 ? srd : srd.filter((entry) => !hidden.has(`${entry.edition}/${entry.slug}`));
}

/** One bestiary line for a stored creature, carrying its book when it was imported. */
export function customSummary(creature: Creature): MonsterSummary {
  const line = summarise(creature.id, creature.id, "custom", creature.kind, creature.statBlock, creature.tags);
  return creature.source ? { ...line, source: sourceLabel(creature.source) } : line;
}
