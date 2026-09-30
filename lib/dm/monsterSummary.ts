import type { StatBlock } from "./statblock";

// One line of the bestiary list. Kept apart from srd.ts (server-only, loads the
// whole data set) so pages rendered in the browser can build summaries too.

export type Edition = "2014" | "2024";

export type MonsterSummary = {
  id: string;
  slug: string;
  edition: Edition | "custom";
  kind: "monster" | "npc";
  name: string;
  cr: string;
  type: string;
  size: string;
  hp: number;
  ac: number;
  tags?: string[];
};

export function summarise(
  id: string,
  slug: string,
  edition: MonsterSummary["edition"],
  kind: MonsterSummary["kind"],
  block: StatBlock,
  tags?: string[],
): MonsterSummary {
  return {
    id, slug, edition, kind, name: block.name, cr: block.cr, type: block.type, size: block.size, hp: block.hp, ac: block.ac,
    ...(tags?.length ? { tags } : {}),
  };
}
