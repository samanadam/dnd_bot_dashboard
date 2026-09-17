// Fetches the two Wizards of the Coast SRD bestiaries (CC-BY-4.0) from Open5e,
// converts them and writes data/srd/srd-2014.json and srd-2024.json.
// Run by hand when the data should be refreshed:
//   npx tsx@4.23.13 scripts/import-srd.mts
// Only these two documents are allowed: other Open5e documents carry other
// licenses and must never be bundled into this public repository.
import { mkdirSync, writeFileSync } from "node:fs";
import { normaliseOpen5e, slugFromKey, type Open5eCreature } from "../lib/dm/open5e";

const DOCUMENTS = { "2014": "srd-2014", "2024": "srd-2024" } as const;

// Known errors in the Open5e data, corrected to the published SRD values.
// Each entry is checked: if the source is fixed, the import fails loudly so the
// correction can be removed instead of silently overwriting good data.
const CORRECTIONS: Record<string, { expect: Partial<Open5eCreature["ability_scores"]>; set: Partial<Open5eCreature["ability_scores"]> }> = {
  // SRD 5.2 Octopus: CON 11, CHA 4 (Open5e lists the modifiers 0 and -3).
  "srd-2024_octopus": { expect: { constitution: 0, charisma: -3 }, set: { constitution: 11, charisma: 4 } },
};

function correct(creature: Open5eCreature): Open5eCreature {
  const fix = CORRECTIONS[creature.key];
  if (!fix) return creature;
  for (const [ability, value] of Object.entries(fix.expect)) {
    if (creature.ability_scores[ability as keyof Open5eCreature["ability_scores"]] !== value) {
      throw new Error(`${creature.key}: source data changed, review CORRECTIONS`);
    }
  }
  return { ...creature, ability_scores: { ...creature.ability_scores, ...fix.set } };
}

const API = "https://api.open5e.com/v2/creatures/";

async function fetchAll(document: string): Promise<Open5eCreature[]> {
  const out: Open5eCreature[] = [];
  let url: string | null = `${API}?document__key=${document}&limit=100`;
  while (url) {
    if (!url.startsWith(API)) throw new Error(`unexpected pagination url: ${url}`);
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`${response.status} for ${url}`);
    const page = (await response.json()) as { results: Open5eCreature[]; next: string | null };
    out.push(...page.results);
    url = page.next;
  }
  return out;
}

mkdirSync("data/srd", { recursive: true });
let failures = 0;
for (const [edition, document] of Object.entries(DOCUMENTS)) {
  const raw = await fetchAll(document);
  const monsters: Array<{ slug: string; statBlock: ReturnType<typeof normaliseOpen5e> }> = [];
  const seen = new Set<string>();
  for (const creature of raw) {
    if (creature.document?.key !== document) throw new Error(`document mismatch for ${creature.key}`);
    const slug = slugFromKey(creature.key);
    if (!/^[a-z0-9-]{1,80}$/.test(slug) || seen.has(slug)) throw new Error(`bad or duplicate slug: ${creature.key}`);
    seen.add(slug);
    try {
      monsters.push({ slug, statBlock: normaliseOpen5e(correct(creature)) });
    } catch (error) {
      failures++;
      console.error(`  ${creature.key}: ${String(error).slice(0, 300)}`);
    }
  }
  monsters.sort((a, b) => a.statBlock.name.localeCompare(b.statBlock.name));
  writeFileSync(
    `data/srd/srd-${edition}.json`,
    `${JSON.stringify({ edition, source: document, license: "CC-BY-4.0", monsters })}\n`,
  );
  console.log(`${document}: ${monsters.length} monsters written`);
}
if (failures) {
  console.error(`${failures} creatures failed to convert`);
  process.exit(1);
}
