import { z } from "zod";

// One shape for every creature the DM tools show: SRD monsters (converted on
// import), the DM's own monsters and NPCs. Stored and rendered as plain text;
// nothing here is ever treated as HTML.

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

export const SIZES = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"] as const;

export const CR_VALUES: readonly string[] = ["0", "1/8", "1/4", "1/2", ...Array.from({ length: 30 }, (_, i) => String(i + 1))];

// Experience points by challenge rating (SRD).
export const XP_BY_CR: Record<string, number> = {
  "0": 10, "1/8": 25, "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800, "6": 2300,
  "7": 2900, "8": 3900, "9": 5000, "10": 5900, "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000,
  "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000, "21": 33000, "22": 41000, "23": 50000,
  "24": 62000, "25": 75000, "26": 90000, "27": 105000, "28": 120000, "29": 135000, "30": 155000,
};

const text = (max: number) => z.string().trim().max(max);
const int = (min: number, max: number) => z.number().int().min(min).max(max);
// Dice like "2d6+3" or "1d10 + 2d4". The dice parser checks structure at roll time.
const diceText = z.string().trim().regex(/^[0-9dD+\- ]{1,40}$/, "must be dice like 2d6+3");

const attackSchema = z
  .object({
    toHit: int(-20, 40),
    damage: diceText.optional(),
    damageType: text(40).optional(),
    extraDamage: diceText.optional(),
    extraDamageType: text(40).optional(),
  })
  .strict();

export const featureSchema = z
  .object({ name: text(120).min(1), desc: text(4000), attack: attackSchema.optional() })
  .strict();

const features = (max: number) => z.array(featureSchema).max(max);
const score = int(1, 30);

export const statBlockSchema = z
  .object({
    name: text(120).min(1),
    size: z.enum(SIZES),
    type: text(80),
    alignment: text(80),
    ac: int(0, 40),
    acNote: text(120),
    hp: int(1, 10_000),
    hitDice: text(40),
    speed: text(200),
    abilities: z.object({ str: score, dex: score, con: score, int: score, wis: score, cha: score }).strict(),
    saves: z.partialRecord(z.enum(ABILITIES), int(-20, 40)),
    skills: z
      .record(z.string().regex(/^[a-z_]{1,30}$/), int(-20, 40))
      .refine((value) => Object.keys(value).length <= 30, "too many skills"),
    senses: text(300),
    languages: text(300),
    cr: z.string().refine((value) => CR_VALUES.includes(value), "invalid challenge rating"),
    xp: int(0, 1_000_000),
    proficiencyBonus: int(0, 20).optional(),
    initiativeBonus: int(-20, 40).optional(),
    damageVulnerabilities: text(300),
    damageResistances: text(300),
    damageImmunities: text(300),
    conditionImmunities: text(300),
    traits: features(40),
    actions: features(40),
    bonusActions: features(20),
    reactions: features(20),
    legendaryActions: features(20),
    legendaryDescription: text(1000),
  })
  .strict();

export type StatBlock = z.infer<typeof statBlockSchema>;
export type Feature = z.infer<typeof featureSchema>;
export type Attack = z.infer<typeof attackSchema>;

export function abilityModifier(value: number): number {
  return Math.floor((value - 10) / 2);
}

export function formatModifier(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

export function crToNumber(cr: string): number {
  if (cr.includes("/")) {
    const [top, bottom] = cr.split("/").map(Number);
    return top / bottom;
  }
  return Number(cr);
}

export function initiativeBonus(block: StatBlock): number {
  return block.initiativeBonus ?? abilityModifier(block.abilities.dex);
}

export function proficiencyForCr(cr: string): number {
  const value = crToNumber(cr);
  return value < 5 ? 2 : Math.min(9, 2 + Math.ceil((value - 4) / 4));
}
