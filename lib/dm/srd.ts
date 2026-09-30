import "server-only";
import srd2014 from "@/data/srd/srd-2014.json";
import srd2024 from "@/data/srd/srd-2024.json";
import { summarise, type Edition, type MonsterSummary } from "./monsterSummary";
import type { StatBlock } from "./statblock";

export type { Edition, MonsterSummary } from "./monsterSummary";
export { summarise };

type DataFile = { edition: Edition; monsters: Array<{ slug: string; statBlock: StatBlock }> };

const FILES: Record<Edition, DataFile> = {
  "2014": srd2014 as unknown as DataFile,
  "2024": srd2024 as unknown as DataFile,
};

const bySlug = new Map<string, StatBlock>();
for (const file of Object.values(FILES)) {
  for (const monster of file.monsters) bySlug.set(`${file.edition}/${monster.slug}`, monster.statBlock);
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
