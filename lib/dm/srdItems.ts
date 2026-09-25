import "server-only";
import items2014 from "@/data/srd/items-2014.json";
import items2024 from "@/data/srd/items-2024.json";
import type { Edition } from "./srd";
import type { ItemBlock } from "./items";

// The bundled SRD items, read-only. Referenced by { edition, slug }.

type DataFile = { edition: Edition; items: Array<{ slug: string; item: ItemBlock }> };

const FILES: Record<Edition, DataFile> = {
  "2014": items2014 as unknown as DataFile,
  "2024": items2024 as unknown as DataFile,
};

export type SrdItemSummary = { edition: Edition; slug: string; name: string; category: string; rarity: string; attunement: boolean };

const bySlug = new Map<string, ItemBlock>();
for (const file of Object.values(FILES)) {
  for (const { slug, item } of file.items) bySlug.set(`${file.edition}/${slug}`, item);
}

let summaries: SrdItemSummary[] | null = null;

export function listSrdItems(): SrdItemSummary[] {
  summaries ??= Object.values(FILES).flatMap((file) =>
    file.items.map(({ slug, item }) => ({
      edition: file.edition,
      slug,
      name: item.name,
      category: item.category,
      rarity: item.rarity,
      attunement: item.attunement !== "",
    })),
  );
  return summaries;
}

export function getSrdItem(edition: Edition, slug: string): ItemBlock | null {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  return bySlug.get(`${edition}/${slug}`) ?? null;
}
