import { z } from "zod";
import { featBlockSchema, type FeatBlock } from "./feats";
import { slugFromKey } from "./open5e";
import { ABILITIES, spellBlockSchema, type SpellBlock } from "./spells";

// Converts one Open5e v2 spell or feat into this portal's format. Used only by
// scripts/import-srd-spells.mts; the portal itself never calls Open5e.

/** The only Open5e documents whose spells and feats may be bundled: both are CC-BY-4.0. */
export const SRD_SPELL_DOCUMENTS = { "srd-2014": "2014", "srd-2024": "2024" } as const;
export type SrdSpellDocument = keyof typeof SRD_SPELL_DOCUMENTS;

export function isSrdSpellDocument(key: unknown): key is SrdSpellDocument {
  return typeof key === "string" && Object.hasOwn(SRD_SPELL_DOCUMENTS, key);
}

export function spellSlug(key: string): string {
  return slugFromKey(key);
}

// Every casting-time code the SRD uses. Anything else stops the import: a new
// code needs a human to decide how it reads.
const CASTING_TIMES: Record<string, string> = {
  action: "1 action",
  "bonus-action": "1 bonus action",
  reaction: "1 reaction",
  turn: "1 turn",
  "1turn": "1 turn",
  "1minute": "1 minute",
  "10minutes": "10 minutes",
  "1hour": "1 hour",
  "8hours": "8 hours",
  "12hours": "12 hours",
  "24hours": "24 hours",
};

const ABILITY_NAMES: Record<string, (typeof ABILITIES)[number]> = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
};

const option = z.object({ type: z.string(), damage_roll: z.string().nullish() });

const open5eSpellSchema = z.object({
  key: z.string(),
  name: z.string(),
  desc: z.string().nullish(),
  higher_level: z.string().nullish(),
  level: z.number().int(),
  school: z.object({ key: z.string() }),
  classes: z.array(z.object({ name: z.string() })).default([]),
  casting_time: z.string(),
  reaction_condition: z.string().nullish(),
  ritual: z.boolean(),
  range_text: z.string().nullish(),
  shape_type: z.string().nullish(),
  shape_size: z.number().nullish(),
  shape_size_unit: z.string().nullish(),
  verbal: z.boolean(),
  somatic: z.boolean(),
  material: z.boolean(),
  material_specified: z.string().nullish(),
  material_cost: z.string().nullish(),
  material_consumed: z.boolean().nullish(),
  duration: z.string(),
  concentration: z.boolean(),
  attack_roll: z.boolean().nullish(),
  saving_throw_ability: z.string().nullish(),
  damage_roll: z.string().nullish(),
  damage_types: z.array(z.string()).default([]),
  casting_options: z.array(option).default([]),
  document: z.object({ key: z.string() }),
});

const capitalise = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text);

function castingTime(code: string, condition: string | null | undefined, key: string): string {
  const text = CASTING_TIMES[code];
  if (!text) throw new Error(`${key}: unknown casting time ${JSON.stringify(code)}`);
  return code === "reaction" && condition?.trim() ? `${text}, ${condition.trim()}` : text;
}

function range(spell: z.infer<typeof open5eSpellSchema>): string {
  const base = spell.range_text?.trim() || "Self";
  if (base === "Self" && spell.shape_type && spell.shape_size) {
    const unit = spell.shape_size_unit === "miles" ? "mile" : "foot";
    return `Self (${spell.shape_size}-${unit} ${spell.shape_type})`;
  }
  return base;
}

function effect(spell: z.infer<typeof open5eSpellSchema>): SpellBlock["effect"] {
  const roll = spell.damage_roll?.trim();
  if (!roll) return null;
  const desc = spell.desc ?? "";
  if (spell.damage_types.length === 0 && /\bregains?\b[^.]*\bhit points\b/i.test(desc)) {
    return { kind: "healing", roll, types: [] };
  }
  if (spell.damage_types.length > 0 || /\bdamage\b/i.test(desc)) {
    return { kind: "damage", roll, types: spell.damage_types.map((type) => type.toLowerCase()) };
  }
  // A roll that is neither (Bless's d4, Teleport's mishap table): the text says it all.
  return null;
}

function scaling(spell: z.infer<typeof open5eSpellSchema>): SpellBlock["scaling"] {
  for (const by of ["slot", "character"] as const) {
    const prefix = by === "slot" ? "slot_level_" : "player_level_";
    const steps = spell.casting_options
      .filter((o) => o.type.startsWith(prefix) && o.damage_roll?.trim())
      .map((o) => ({ at: Number(o.type.slice(prefix.length)), roll: o.damage_roll!.trim() }))
      .filter((step) => Number.isInteger(step.at) && step.at >= 1 && step.at <= 20)
      .sort((a, b) => a.at - b.at);
    if (steps.length > 0) return { by, steps };
  }
  return null;
}

function cost(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Throws when the entry is not in the shape the importer expects. */
export function normaliseOpen5eSpell(raw: unknown): SpellBlock {
  const spell = open5eSpellSchema.parse(raw);
  const touchOrSelf = /^(touch|self)/i.test(spell.range_text ?? "");
  const save = spell.saving_throw_ability ? ABILITY_NAMES[spell.saving_throw_ability.toLowerCase()] : null;
  if (spell.saving_throw_ability && !save) throw new Error(`${spell.key}: unknown save ${spell.saving_throw_ability}`);

  return spellBlockSchema.parse({
    name: spell.name,
    level: spell.level,
    school: spell.school.key,
    castingTime: castingTime(spell.casting_time, spell.reaction_condition, spell.key),
    ritual: spell.ritual,
    range: range(spell),
    components: {
      verbal: spell.verbal,
      somatic: spell.somatic,
      material: spell.material,
      materialText: spell.material ? (spell.material_specified ?? "").trim() : "",
      materialCostGp: spell.material ? cost(spell.material_cost) : null,
      materialConsumed: Boolean(spell.material && spell.material_consumed),
    },
    duration: capitalise(spell.duration.trim()),
    concentration: spell.concentration,
    classes: [...new Set(spell.classes.map((c) => c.name.trim()).filter(Boolean))].sort(),
    attack: spell.attack_roll ? (touchOrSelf ? "melee" : "ranged") : null,
    save: save ?? null,
    effect: effect(spell),
    scaling: scaling(spell),
    description: spell.desc ?? "",
    higherLevel: spell.higher_level ?? "",
  });
}

const open5eFeatSchema = z.object({
  key: z.string(),
  name: z.string(),
  desc: z.string().nullish(),
  type: z.string().nullish(),
  prerequisite: z.string().nullish(),
  benefits: z.array(z.object({ desc: z.string() })).default([]),
  document: z.object({ key: z.string() }),
});

/** Throws when the entry is not in the shape the importer expects. */
export function normaliseOpen5eFeat(raw: unknown): FeatBlock {
  const feat = open5eFeatSchema.parse(raw);
  const benefits = feat.benefits.map((b) => b.desc.trim()).filter(Boolean);
  const description = [feat.desc?.trim() ?? "", ...benefits].filter(Boolean).join("\n\n");
  return featBlockSchema.parse({
    name: feat.name,
    category: (feat.type ?? "").trim(),
    prerequisite: (feat.prerequisite ?? "").trim(),
    repeatable: /more than once/i.test(description),
    description,
  });
}
