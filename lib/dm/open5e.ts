import { statBlockSchema, type Feature, type StatBlock } from "./statblock";

// Converts one Open5e v2 creature into our StatBlock. Used only by
// scripts/import-srd.mts at import time; the running portal reads the result.

type Named = { name: string } | null | undefined;

type Open5eAttack = {
  to_hit_mod: number | null;
  damage_die_count: number | null;
  damage_die_type: string | null;
  damage_bonus: number | null;
  damage_type: Named;
  extra_damage_die_count: number | null;
  extra_damage_die_type: string | null;
  extra_damage_bonus: number | null;
  extra_damage_type: Named;
};

type Open5eAction = {
  name: string;
  desc: string;
  action_type: string;
  order_in_statblock?: number | null;
  attacks?: Open5eAttack[] | null;
};

export type Open5eCreature = {
  key: string;
  name: string;
  document?: { key?: string } | null;
  size: Named;
  type: Named;
  subcategory?: string | null;
  alignment?: string | null;
  armor_class: number;
  armor_detail?: string | null;
  hit_points: number;
  hit_dice?: string | null;
  speed?: Record<string, unknown> | null;
  ability_scores: Record<"strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma", number>;
  saving_throws?: Record<string, number> | null;
  skill_bonuses?: Record<string, number> | null;
  darkvision_range?: number | null;
  blindsight_range?: number | null;
  tremorsense_range?: number | null;
  truesight_range?: number | null;
  passive_perception?: number | null;
  languages?: { as_string?: string } | null;
  challenge_rating: number;
  experience_points?: number | null;
  proficiency_bonus?: number | null;
  initiative_bonus?: number | null;
  resistances_and_immunities?: Record<string, unknown> | null;
  traits?: Array<{ name: string; desc: string }> | null;
  actions?: Open5eAction[] | null;
};

const ABILITY_KEYS = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
} as const;

const CR_FRACTIONS: Record<string, string> = { "0.125": "1/8", "0.25": "1/4", "0.5": "1/2" };

export function slugFromKey(key: string): string {
  return key.slice(key.indexOf("_") + 1);
}

function dice(count: number | null, type: string | null, bonus: number | null): string | undefined {
  if (!count || !type) return undefined;
  const sides = type.replace(/^d/i, "");
  const plus = bonus ? (bonus > 0 ? `+${bonus}` : String(bonus)) : "";
  return `${count}d${sides}${plus}`;
}

function clip(value: string | null | undefined, max: number): string {
  return (value ?? "").trim().slice(0, max);
}

function feature(action: { name: string; desc: string; attacks?: Open5eAttack[] | null }): Feature {
  const result: Feature = { name: clip(action.name, 120), desc: clip(action.desc, 4000) };
  const attack = action.attacks?.[0];
  if (attack && typeof attack.to_hit_mod === "number") {
    const damage = dice(attack.damage_die_count, attack.damage_die_type, attack.damage_bonus);
    const extraDamage = dice(attack.extra_damage_die_count, attack.extra_damage_die_type, attack.extra_damage_bonus);
    result.attack = {
      toHit: attack.to_hit_mod,
      ...(damage ? { damage } : {}),
      ...(attack.damage_type?.name ? { damageType: attack.damage_type.name } : {}),
      ...(extraDamage ? { extraDamage } : {}),
      ...(attack.extra_damage_type?.name ? { extraDamageType: attack.extra_damage_type.name } : {}),
    };
  }
  return result;
}

function speedText(speed: Open5eCreature["speed"]): string {
  if (!speed) return "";
  const parts: string[] = [];
  if (typeof speed.walk === "number" && speed.walk > 0) parts.push(`${speed.walk} ft.`);
  for (const mode of ["burrow", "climb", "fly", "swim"] as const) {
    const value = speed[mode];
    if (typeof value === "number" && value > 0) {
      parts.push(`${mode} ${value} ft.${mode === "fly" && speed.hover === true ? " (hover)" : ""}`);
    }
  }
  return parts.join(", ");
}

function sensesText(raw: Open5eCreature): string {
  const parts: string[] = [];
  const senses = [
    ["blindsight_range", "blindsight"],
    ["darkvision_range", "darkvision"],
    ["tremorsense_range", "tremorsense"],
    ["truesight_range", "truesight"],
  ] as const;
  for (const [field, label] of senses) {
    const value = raw[field];
    if (typeof value === "number" && value > 0) parts.push(`${label} ${value} ft.`);
  }
  if (typeof raw.passive_perception === "number") parts.push(`passive Perception ${raw.passive_perception}`);
  return parts.join(", ");
}

function display(raw: Open5eCreature, field: string): string {
  const value = raw.resistances_and_immunities?.[`${field}_display`];
  return typeof value === "string" ? clip(value, 300) : "";
}

const SPECIAL_ACTIONS = new Set(["BONUS_ACTION", "REACTION", "LEGENDARY_ACTION"]);

export function normaliseOpen5e(raw: Open5eCreature): StatBlock {
  const actions = [...(raw.actions ?? [])].sort(
    (a, b) => (a.order_in_statblock ?? 0) - (b.order_in_statblock ?? 0) || a.name.localeCompare(b.name),
  );
  const byType = (type: string) => actions.filter((action) => action.action_type === type).map(feature);

  const saves: StatBlock["saves"] = {};
  for (const [name, value] of Object.entries(raw.saving_throws ?? {})) {
    const key = ABILITY_KEYS[name as keyof typeof ABILITY_KEYS];
    if (key && typeof value === "number") saves[key] = value;
  }

  const skills: StatBlock["skills"] = {};
  for (const [name, value] of Object.entries(raw.skill_bonuses ?? {})) {
    if (typeof value === "number" && /^[a-z_]{1,30}$/.test(name)) skills[name] = value;
  }

  const legendary = byType("LEGENDARY_ACTION");
  const block: StatBlock = {
    name: clip(raw.name, 120),
    size: (raw.size?.name ?? "Medium") as StatBlock["size"],
    type: clip([raw.type?.name, raw.subcategory ? `(${raw.subcategory})` : ""].filter(Boolean).join(" "), 80),
    alignment: clip(raw.alignment, 80),
    ac: raw.armor_class,
    acNote: clip(raw.armor_detail, 120),
    hp: raw.hit_points,
    hitDice: clip((raw.hit_dice ?? "").replace(/\s+/g, ""), 40),
    speed: speedText(raw.speed),
    abilities: {
      str: raw.ability_scores.strength,
      dex: raw.ability_scores.dexterity,
      con: raw.ability_scores.constitution,
      int: raw.ability_scores.intelligence,
      wis: raw.ability_scores.wisdom,
      cha: raw.ability_scores.charisma,
    },
    saves,
    skills,
    senses: clip(sensesText(raw), 300),
    languages: clip(raw.languages?.as_string, 300),
    cr: CR_FRACTIONS[String(raw.challenge_rating)] ?? String(Math.round(raw.challenge_rating)),
    xp: raw.experience_points ?? 0,
    ...(typeof raw.proficiency_bonus === "number" ? { proficiencyBonus: raw.proficiency_bonus } : {}),
    ...(typeof raw.initiative_bonus === "number" ? { initiativeBonus: raw.initiative_bonus } : {}),
    damageVulnerabilities: display(raw, "damage_vulnerabilities"),
    damageResistances: display(raw, "damage_resistances"),
    damageImmunities: display(raw, "damage_immunities"),
    conditionImmunities: display(raw, "condition_immunities"),
    traits: (raw.traits ?? []).map(feature),
    actions: actions.filter((action) => !SPECIAL_ACTIONS.has(action.action_type)).map(feature),
    bonusActions: byType("BONUS_ACTION"),
    reactions: byType("REACTION"),
    legendaryActions: legendary,
    legendaryDescription: legendary.length
      ? "Legendary actions are taken one at a time, only at the end of another creature's turn. Spent actions are regained at the start of this creature's turn."
      : "",
  };
  return statBlockSchema.parse(block);
}
