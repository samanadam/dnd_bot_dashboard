import "server-only";
import srd2014 from "@/data/srd/srd-2014.json";
import srd2024 from "@/data/srd/srd-2024.json";
import type { StatBlock } from "./statblock";

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

type DataFile = { edition: Edition; monsters: Array<{ slug: string; statBlock: StatBlock }> };

const FILES: Record<Edition, DataFile> = {
  "2014": srd2014 as DataFile,
  "2024": srd2024 as DataFile,
};

const bySlug = new Map<string, StatBlock>();
for (const file of Object.values(FILES)) {
  for (const monster of file.monsters) bySlug.set(`${file.edition}/${monster.slug}`, monster.statBlock);
}

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

let summaries: MonsterSummary[] | null = null;

export function listSrd(): MonsterSummary[] {
  summaries ??= Object.values(FILES).flatMap((file) =>
    file.monsters.map((m) => summarise(`srd-${file.edition}:${m.slug}`, m.slug, file.edition, "monster", m.statBlock)),
  );
  return summaries;
}

export function isEdition(value: unknown): value is Edition {
  return value === "2014" || value === "2024";
}

export function getSrd(edition: Edition, slug: string): StatBlock | null {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  return bySlug.get(`${edition}/${slug}`) ?? null;
}
