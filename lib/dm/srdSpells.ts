import "server-only";
import feats2014 from "@/data/srd/feats-2014.json";
import feats2024 from "@/data/srd/feats-2024.json";
import spells2014 from "@/data/srd/spells-2014.json";
import spells2024 from "@/data/srd/spells-2024.json";
import type { FeatBlock } from "./feats";
import type { Edition } from "./srd";
import type { SpellBlock } from "./spells";

// The bundled SRD spells and feats, read-only. Referenced by { edition, slug }.

type SpellFile = { edition: Edition; spells: Array<{ slug: string; spell: SpellBlock }> };
type FeatFile = { edition: Edition; feats: Array<{ slug: string; feat: FeatBlock }> };

const SPELL_FILES: SpellFile[] = [spells2014 as unknown as SpellFile, spells2024 as unknown as SpellFile];
const FEAT_FILES: FeatFile[] = [feats2014 as unknown as FeatFile, feats2024 as unknown as FeatFile];

export type SrdSpellSummary = {
  edition: Edition;
  slug: string;
  name: string;
  level: number;
  school: SpellBlock["school"];
  castingTime: string;
  concentration: boolean;
  ritual: boolean;
  classes: string[];
};

export type SrdFeatSummary = { edition: Edition; slug: string; name: string; category: string; prerequisite: string };

const SLUG = /^[a-z0-9-]{1,80}$/;

const spellsBySlug = new Map<string, SpellBlock>();
for (const file of SPELL_FILES) for (const { slug, spell } of file.spells) spellsBySlug.set(`${file.edition}/${slug}`, spell);
const featsBySlug = new Map<string, FeatBlock>();
for (const file of FEAT_FILES) for (const { slug, feat } of file.feats) featsBySlug.set(`${file.edition}/${slug}`, feat);

let spellSummaries: SrdSpellSummary[] | null = null;
let featSummaries: SrdFeatSummary[] | null = null;

export function listSrdSpells(): SrdSpellSummary[] {
  spellSummaries ??= SPELL_FILES.flatMap((file) =>
    file.spells.map(({ slug, spell }) => ({
      edition: file.edition,
      slug,
      name: spell.name,
      level: spell.level,
      school: spell.school,
      castingTime: spell.castingTime,
      concentration: spell.concentration,
      ritual: spell.ritual,
      classes: spell.classes,
    })),
  );
  return spellSummaries;
}

export function getSrdSpell(edition: Edition, slug: string): SpellBlock | null {
  if (!SLUG.test(slug)) return null;
  return spellsBySlug.get(`${edition}/${slug}`) ?? null;
}

export function listSrdFeats(): SrdFeatSummary[] {
  featSummaries ??= FEAT_FILES.flatMap((file) =>
    file.feats.map(({ slug, feat }) => ({ edition: file.edition, slug, name: feat.name, category: feat.category, prerequisite: feat.prerequisite })),
  );
  return featSummaries;
}

export function getSrdFeat(edition: Edition, slug: string): FeatBlock | null {
  if (!SLUG.test(slug)) return null;
  return featsBySlug.get(`${edition}/${slug}`) ?? null;
}
