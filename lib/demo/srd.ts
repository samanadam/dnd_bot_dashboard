import { summarise, type MonsterSummary } from "@/lib/dm/monsterSummary";
import type { StatBlock } from "@/lib/dm/statblock";
import type { DemoState } from "./fixtures";
import { DEMO_SRD_MONSTERS } from "./srdSample";

/** The demo's SRD sample as bestiary lines, with the same ids the portal uses. */
export function demoSrdSummaries(): MonsterSummary[] {
  return DEMO_SRD_MONSTERS.map((m) => summarise(`srd-${m.edition}:${m.slug}`, m.slug, m.edition, "monster", m.statBlock));
}

export function demoSrdBlock(edition: string, slug: string): StatBlock | null {
  return DEMO_SRD_MONSTERS.find((m) => m.edition === edition && m.slug === slug)?.statBlock ?? null;
}

/** Custom creatures as bestiary lines; monsters only unless every kind is wanted. */
export function demoCustomSummaries(state: DemoState, kinds: "monster" | "all"): MonsterSummary[] {
  return state.dm.creatures
    .filter((c) => kinds === "all" || c.kind === "monster")
    .map((c) => summarise(c.id, c.id, "custom", c.kind, c.statBlock, c.tags));
}
