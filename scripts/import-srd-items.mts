// Fetches the SRD equipment and magic items (CC-BY-4.0) from Open5e, converts
// them and writes data/srd/items-2014.json and items-2024.json.
// Run by hand when the data should be refreshed:
//   npx tsx@4.23.13 scripts/import-srd-items.mts
// The Open5e item endpoints ignore the document filter and mix in other books
// (for example Vault of Magic, which is not free to redistribute). Every entry
// is therefore checked against an explicit allowlist of two documents, and
// anything else is dropped before it can reach this public repository.
import { mkdirSync, writeFileSync } from "node:fs";
import { isSrdItemDocument, itemSlug, normaliseOpen5eItem, SRD_ITEM_DOCUMENTS } from "../lib/dm/openItems";
import type { ItemBlock } from "../lib/dm/items";

const ENDPOINTS = ["https://api.open5e.com/v2/items/", "https://api.open5e.com/v2/magicitems/"] as const;

type Raw = { key: string; document?: { key?: string } };

async function fetchAll(endpoint: string): Promise<Raw[]> {
  const out: Raw[] = [];
  let url: string | null = `${endpoint}?limit=500`;
  while (url) {
    if (!url.startsWith(endpoint)) throw new Error(`unexpected pagination url: ${url}`);
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`${response.status} for ${url}`);
    const page = (await response.json()) as { results: Raw[]; next: string | null };
    out.push(...page.results);
    url = page.next;
  }
  return out;
}

const byEdition: Record<string, Map<string, ItemBlock>> = { "2014": new Map(), "2024": new Map() };
let dropped = 0;
let failures = 0;
for (const endpoint of ENDPOINTS) {
  for (const raw of await fetchAll(endpoint)) {
    const document = raw.document?.key;
    if (!isSrdItemDocument(document)) {
      dropped++;
      continue;
    }
    const slug = itemSlug(raw.key);
    const edition = SRD_ITEM_DOCUMENTS[document];
    try {
      if (!/^[a-z0-9-]{1,80}$/.test(slug) || byEdition[edition].has(slug)) throw new Error("bad or duplicate slug");
      byEdition[edition].set(slug, normaliseOpen5eItem(raw));
    } catch (error) {
      failures++;
      console.error(`  ${raw.key}: ${String(error).slice(0, 300)}`);
    }
  }
}

mkdirSync("data/srd", { recursive: true });
for (const [edition, entries] of Object.entries(byEdition)) {
  const items = [...entries].map(([slug, item]) => ({ slug, item })).sort((a, b) => a.item.name.localeCompare(b.item.name) || a.slug.localeCompare(b.slug));
  writeFileSync(`data/srd/items-${edition}.json`, `${JSON.stringify({ edition, source: `srd-${edition}`, license: "CC-BY-4.0", items })}\n`);
  console.log(`srd-${edition}: ${items.length} items written`);
}
console.log(`${dropped} entries from other documents dropped`);
if (failures) {
  console.error(`${failures} items failed to convert`);
  process.exit(1);
}
