import { statBlockSchema, type Attack, type Feature, type StatBlock } from "./statblock";

// Converts the monster stat blocks on a D&D Beyond book page (the HTML inside
// `.p-article-content`) into this portal's StatBlock. Everything is read as text:
// nothing from the page is kept as HTML. Used by the book import route; the
// markup it expects is described in data-ignore/README.md.

export type ConvertedBlock = { sourceKey: string; name: string; statBlock: StatBlock };
export type ConvertIssue = { name: string; reason: string };
export type ConvertResult = { blocks: ConvertedBlock[]; issues: ConvertIssue[]; found: number };

const CONDITIONS = new Set([
  "blinded", "charmed", "deafened", "exhaustion", "frightened", "grappled", "incapacitated", "invisible",
  "paralyzed", "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious",
]);
const ENTITIES: Record<string, string> = { amp: "&", nbsp: " ", lt: "<", gt: ">", quot: '"', "#39": "'", rsquo: "’" };
const SECTIONS = { Traits: "traits", Actions: "actions", "Bonus Actions": "bonusActions", Reactions: "reactions", "Legendary Actions": "legendaryActions" } as const;
type SectionKey = (typeof SECTIONS)[keyof typeof SECTIONS];

const clean = (html: string) =>
  html.replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "").replace(/&(amp|nbsp|lt|gt|quot|#39|rsquo);/g, (_, e: string) => ENTITIES[e]).replace(/\s+/g, " ").trim();
const minus = (text: string) => text.replace(/[−–]/g, "-");
const num = (text: string) => Number(minus(text).replace("+", ""));
const dice = (text: string) => minus(text).replace(/\s+/g, "");

/** The inside of each stat-block div, found by counting nested divs. */
function splitBlocks(html: string): string[] {
  return html
    .split('<div class="stat-block"')
    .slice(1)
    .map((part) => {
      let depth = 1;
      for (const m of part.matchAll(/<div[\s>]|<\/div>/g)) {
        depth += m[0] === "</div>" ? -1 : 1;
        if (depth === 0) return part.slice(0, m.index);
      }
      return part;
    });
}

type Element = { tag: string; attrs: string; html: string };

function mapBlock(block: string): { name: string; sourceKey: string; value: Record<string, unknown> } {
  const heading = block.match(/<h\d[^>]*>([\s\S]*?)<\/h\d>/);
  const name = clean(heading?.[1] ?? "");
  const sourceKey = heading?.[0].match(/\/monsters\/(\d+)-/)?.[1] ?? heading?.[0].match(/id="([A-Za-z0-9]+?)StatBlock"/)?.[1] ?? name;
  const stats = block.match(/<div class="stats"[\s\S]*?<\/table><\/div>\s*<\/div>/)?.[0] ?? "";
  const rest = block.slice(block.search(/<\/h\d>/)).replace(stats, "");
  const ps: Element[] = [...rest.matchAll(/<(p|ul|table)\b([^>]*)>([\s\S]*?)<\/\1>/g)].map((m) => ({ tag: m[1], attrs: m[2], html: m[3] }));

  const labelled = (label: string) => {
    const el = ps.find((p) => p.html.trim().startsWith(`<strong>${label}</strong>`));
    return el ? clean(el.html).slice(label.length).trim() : "";
  };

  const first = clean(ps[0]?.html ?? "");
  const head = first.match(/^((?:Tiny|Small|Medium|Large|Huge|Gargantuan)(?: or (?:Tiny|Small|Medium|Large|Huge|Gargantuan))?) (.+), ([^,]+)$/);
  const acLine = labelled("AC");
  const hpLine = labelled("HP");
  const crLine = labelled("CR");

  const abilities: Record<string, number> = {};
  const saves: Record<string, number> = {};
  for (const row of block.matchAll(/<tr>\s*<th>(\w+)<\/th>\s*<td>(\d+)<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>/g)) {
    const key = row[1].toLowerCase();
    abilities[key] = Number(row[2]);
    if (num(row[4]) !== num(row[3])) saves[key] = num(row[4]);
  }

  const skills: Record<string, number> = {};
  for (const part of labelled("Skills").split(/,\s*/).filter(Boolean)) {
    const m = part.match(/^(.+?)\s+([+\-−–]\d+)(?:\s*\(.*\))?$/);
    if (m) skills[m[1].toLowerCase().replace(/\s+/g, "_")] = num(m[2]);
  }

  const damage: string[] = [];
  const conditions: string[] = [];
  for (const item of labelled("Immunities").split(/[,;]\s*/).filter(Boolean)) {
    (CONDITIONS.has(item.toLowerCase().split(" ")[0]) ? conditions : damage).push(item);
  }

  const sections: Record<SectionKey, Feature[]> = { traits: [], actions: [], bonusActions: [], reactions: [], legendaryActions: [] };
  let current: SectionKey = "traits";
  let legendaryDescription = "";
  const crIndex = ps.findIndex((p) => p.html.includes("<strong>CR</strong>"));
  for (const el of ps.slice(crIndex + 1)) {
    const html = el.html.trim();
    if (/class="monster-header"/.test(el.attrs)) {
      current = SECTIONS[clean(html) as keyof typeof SECTIONS] ?? current;
      continue;
    }
    if (/^<strong>(Habitat|Treasure)/.test(html)) continue;
    const run = html.match(/^(?:<strong>[\s\S]*?<\/strong>[ .]*)+/)?.[0] ?? "";
    const named = el.tag === "p" && run && /\.$/.test(clean(run)) && !/^[\d–-]+\.$/.test(clean(run));
    const list = sections[current];
    if (named) list.push({ name: clean(run).replace(/\.$/, ""), desc: clean(html.slice(run.length)) });
    else if (current === "legendaryActions" && list.length === 0) legendaryDescription = `${legendaryDescription} ${clean(html)}`.trim();
    else if (list.length > 0) list[list.length - 1].desc += `\n${clean(html)}`;
  }
  const gear = labelled("Gear");
  if (gear) sections.traits.unshift({ name: "Gear", desc: gear });

  for (const list of Object.values(sections)) {
    for (const f of list) {
      const roll = f.desc.match(/Attack Roll:\s*([+\-−–]\d+)/);
      if (!roll) continue;
      const attack: Attack = { toHit: num(roll[1]) };
      const hit = f.desc.match(/Hit:\s*(\d+)(?:\s*\(([^)]+)\))?\s*([A-Za-z]+) damage(?: plus (\d+)(?:\s*\(([^)]+)\))?\s*([A-Za-z]+) damage)?/);
      if (hit) {
        attack.damage = dice(hit[2] ?? hit[1]);
        attack.damageType = hit[3];
        if (hit[4]) {
          attack.extraDamage = dice(hit[5] ?? hit[4]);
          attack.extraDamageType = hit[6];
        }
      }
      f.attack = attack;
    }
  }

  const initiative = acLine.match(/Initiative\s*([+\-−–]\d+)/)?.[1];
  return {
    name,
    sourceKey,
    value: {
      name,
      size: head?.[1].split(" ")[0],
      type: head?.[2] ?? "",
      alignment: head?.[3] ?? "",
      ac: num(acLine.match(/^(\d+)/)?.[1] ?? "NaN"),
      acNote: acLine.match(/^\d+\s*\(([^)]*)\)\s*(?:Initiative|$)/)?.[1] ?? "",
      hp: Number(hpLine.match(/^(\d+)/)?.[1]),
      hitDice: dice(hpLine.match(/\(([^)]*)\)/)?.[1] ?? ""),
      speed: labelled("Speed"),
      abilities,
      saves,
      skills,
      senses: labelled("Senses"),
      languages: labelled("Languages"),
      cr: crLine.match(/^([\d/]+)/)?.[1],
      xp: Number(crLine.match(/XP\s*([\d,]+)/)?.[1].replace(/,/g, "") ?? 0),
      proficiencyBonus: Number(crLine.match(/PB\s*\+(\d+)/)?.[1]) || undefined,
      ...(initiative ? { initiativeBonus: num(initiative) } : {}),
      damageVulnerabilities: labelled("Vulnerabilities"),
      damageResistances: labelled("Resistances"),
      damageImmunities: damage.join(", "),
      conditionImmunities: conditions.join(", "),
      ...sections,
      legendaryDescription,
    },
  };
}

export function convertMonsterPage(html: string): ConvertResult {
  const blocks: ConvertedBlock[] = [];
  const issues: ConvertIssue[] = [];
  const raw = splitBlocks(html);
  for (const part of raw) {
    const mapped = mapBlock(part);
    const parsed = statBlockSchema.safeParse(mapped.value);
    if (parsed.success) blocks.push({ sourceKey: mapped.sourceKey, name: mapped.name, statBlock: parsed.data });
    else {
      const issue = parsed.error.issues[0];
      issues.push({ name: mapped.name || "(unnamed)", reason: `${issue.path.join(".") || "block"}: ${issue.message}` });
    }
  }
  return { blocks, issues, found: raw.length };
}
