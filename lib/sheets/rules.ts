// Rules data a sheet needs to work out its numbers: abilities and skills, the
// twelve SRD classes, and the spell-slot tables. From the SRD 5.1 and 5.2
// (CC-BY-4.0); see data/srd/NOTICE.md. Everything here is a default the sheet
// may override.

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];

export const ABILITY_NAMES: Record<Ability, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export const SKILLS = {
  acrobatics: { name: "Acrobatics", ability: "dex" },
  "animal-handling": { name: "Animal Handling", ability: "wis" },
  arcana: { name: "Arcana", ability: "int" },
  athletics: { name: "Athletics", ability: "str" },
  deception: { name: "Deception", ability: "cha" },
  history: { name: "History", ability: "int" },
  insight: { name: "Insight", ability: "wis" },
  intimidation: { name: "Intimidation", ability: "cha" },
  investigation: { name: "Investigation", ability: "int" },
  medicine: { name: "Medicine", ability: "wis" },
  nature: { name: "Nature", ability: "int" },
  perception: { name: "Perception", ability: "wis" },
  performance: { name: "Performance", ability: "cha" },
  persuasion: { name: "Persuasion", ability: "cha" },
  religion: { name: "Religion", ability: "int" },
  "sleight-of-hand": { name: "Sleight of Hand", ability: "dex" },
  stealth: { name: "Stealth", ability: "dex" },
  survival: { name: "Survival", ability: "wis" },
} as const satisfies Record<string, { name: string; ability: Ability }>;
export type Skill = keyof typeof SKILLS;
export const SKILL_IDS = Object.keys(SKILLS) as Skill[];

export type Edition = "2014" | "2024";
export type CasterType = "full" | "half" | "third" | "pact" | "none";
export type HitDie = 6 | 8 | 10 | 12;

export type SrdClass = {
  name: string;
  hitDie: HitDie;
  caster: CasterType;
  spellAbility: Ability | null;
  saves: [Ability, Ability];
};

export const SRD_CLASSES: readonly SrdClass[] = [
  { name: "Barbarian", hitDie: 12, caster: "none", spellAbility: null, saves: ["str", "con"] },
  { name: "Bard", hitDie: 8, caster: "full", spellAbility: "cha", saves: ["dex", "cha"] },
  { name: "Cleric", hitDie: 8, caster: "full", spellAbility: "wis", saves: ["wis", "cha"] },
  { name: "Druid", hitDie: 8, caster: "full", spellAbility: "wis", saves: ["int", "wis"] },
  { name: "Fighter", hitDie: 10, caster: "none", spellAbility: null, saves: ["str", "con"] },
  { name: "Monk", hitDie: 8, caster: "none", spellAbility: null, saves: ["str", "dex"] },
  { name: "Paladin", hitDie: 10, caster: "half", spellAbility: "cha", saves: ["wis", "cha"] },
  { name: "Ranger", hitDie: 10, caster: "half", spellAbility: "wis", saves: ["str", "dex"] },
  { name: "Rogue", hitDie: 8, caster: "none", spellAbility: null, saves: ["dex", "int"] },
  { name: "Sorcerer", hitDie: 6, caster: "full", spellAbility: "cha", saves: ["con", "cha"] },
  { name: "Warlock", hitDie: 8, caster: "pact", spellAbility: "cha", saves: ["wis", "cha"] },
  { name: "Wizard", hitDie: 6, caster: "full", spellAbility: "int", saves: ["int", "wis"] },
];

export function srdClass(name: string): SrdClass | null {
  const folded = name.trim().toLocaleLowerCase("en");
  return SRD_CLASSES.find((c) => c.name.toLocaleLowerCase("en") === folded) ?? null;
}

// 2024: every caster prepares from a table by class level (index 0 is level 1).
const PREPARED_2024: Record<string, readonly number[]> = {
  Bard: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22],
  Cleric: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22],
  Druid: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22],
  Paladin: [2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15],
  Ranger: [2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15],
  Sorcerer: [2, 4, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22],
  Warlock: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
  Wizard: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 21, 22, 23, 24, 25],
};

/**
 * How many spells a class prepares by default, or null when it does not prepare
 * (2014 Bards, Rangers, Sorcerers and Warlocks know spells instead) or is not an
 * SRD class. 2014: ability modifier + level (Paladin: + half level), minimum 1.
 */
export function defaultPrepared(edition: Edition, className: string, level: number, abilityMod: number): number | null {
  const known = srdClass(className);
  if (!known) return null;
  if (edition === "2024") return PREPARED_2024[known.name]?.[Math.min(20, Math.max(1, level)) - 1] ?? null;
  if (["Cleric", "Druid", "Wizard"].includes(known.name)) return Math.max(1, abilityMod + level);
  if (known.name === "Paladin") return level < 2 ? null : Math.max(1, abilityMod + Math.floor(level / 2));
  return null;
}

// Spell slots per caster level 1-20 (index 0 is level 1), first to ninth level.
export const SLOT_TABLE: readonly (readonly number[])[] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Pact Magic by Warlock level: how many slots, and their level. */
export function pactSlots(warlockLevel: number): { count: number; level: number } {
  if (warlockLevel < 1) return { count: 0, level: 0 };
  const level = Math.min(5, Math.ceil(Math.min(warlockLevel, 10) / 2));
  const count = warlockLevel === 1 ? 1 : warlockLevel < 11 ? 2 : warlockLevel < 17 ? 3 : 4;
  return { count, level };
}

export const proficiencyBonus = (totalLevel: number) => 2 + Math.floor((Math.max(1, Math.min(20, totalLevel)) - 1) / 4);
export const modifier = (score: number) => Math.floor((score - 10) / 2);

/** Character-level steps at which cantrip damage grows. */
export const CANTRIP_STEPS = [5, 11, 17] as const;

export const CONDITIONS = [
  "Blinded",
  "Charmed",
  "Deafened",
  "Frightened",
  "Grappled",
  "Incapacitated",
  "Invisible",
  "Paralyzed",
  "Petrified",
  "Poisoned",
  "Prone",
  "Restrained",
  "Stunned",
  "Unconscious",
] as const;
