// Fetches the SRD spells and feats (CC-BY-4.0) from Open5e, converts them and
// writes data/srd/spells-2014.json, spells-2024.json, feats-2014.json and
// feats-2024.json. Run by hand when the data should be refreshed:
//   npx tsx@4.23.13 scripts/import-srd-spells.mts
// Every entry is checked against an explicit allowlist of two documents, and
// anything else is dropped before it can reach this public repository.
import { mkdirSync, writeFileSync } from "node:fs";
import { isSrdSpellDocument, normaliseOpen5eFeat, normaliseOpen5eSpell, SRD_SPELL_DOCUMENTS, spellSlug } from "../lib/dm/openSpells";

type Raw = { key: string; name: string; document?: { key?: string } };

async function fetchAll(endpoint: string, document: string): Promise<Raw[]> {
  const out: Raw[] = [];
  let url: string | null = `${endpoint}?document__key=${document}&limit=500`;
  while (url) {
    if (!url.startsWith(endpoint)) throw new Error(`unexpected pagination url: ${url}`);
    const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "dnd-portal-srd-import" } });
    if (!response.ok) throw new Error(`${response.status} for ${url}`);
    const page = (await response.json()) as { results: Raw[]; next: string | null };
    out.push(...page.results);
    url = page.next;
  }
  return out;
}

const KINDS = [
  { endpoint: "https://api.open5e.com/v2/spells/", file: "spells", field: "spells", convert: normaliseOpen5eSpell },
  { endpoint: "https://api.open5e.com/v2/feats/", file: "feats", field: "feats", convert: normaliseOpen5eFeat },
] as const;

let dropped = 0;
let failures = 0;
mkdirSync("data/srd", { recursive: true });

for (const kind of KINDS) {
  for (const [document, edition] of Object.entries(SRD_SPELL_DOCUMENTS)) {
    const entries = new Map<string, { name: string }>();
    for (const raw of await fetchAll(kind.endpoint, document)) {
      // The filter is asked for, and still checked: the endpoint is not trusted to honour it.
      if (!isSrdSpellDocument(raw.document?.key) || raw.document?.key !== document) {
        dropped++;
        continue;
      }
      const slug = spellSlug(raw.key);
      try {
        if (!/^[a-z0-9-]{1,80}$/.test(slug) || entries.has(slug)) throw new Error("bad or duplicate slug");
        entries.set(slug, kind.convert(raw));
      } catch (error) {
        failures++;
        console.error(`  ${raw.key}: ${String(error).slice(0, 300)}`);
      }
    }
    if (entries.size === 0) {
      console.error(`${document}: no ${kind.file} converted`);
      failures++;
      continue;
    }
    const list = [...entries]
      .map(([slug, block]) => ({ slug, [kind.field === "spells" ? "spell" : "feat"]: block, name: block.name }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug))
      .map(({ name: _name, ...entry }) => entry);
    writeFileSync(
      `data/srd/${kind.file}-${edition}.json`,
      `${JSON.stringify({ edition, source: document, license: "CC-BY-4.0", [kind.field]: list })}\n`,
    );
    console.log(`${document}: ${list.length} ${kind.file} written`);
  }
}

console.log(`${dropped} entries from other documents dropped`);
if (failures) {
  console.error(`${failures} entries failed to convert`);
  process.exit(1);
}
