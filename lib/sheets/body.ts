import { z } from "zod";
import { creatureRefSchema } from "@/lib/dm/encounter";
import { diceSchema } from "@/lib/dm/spells";
import { ABILITIES, SKILL_IDS, type Ability } from "./rules";

// A character sheet's body: everything a player types in. The live-play state
// (HP, slots, conditions...) is the separate vitals record (vitals.ts), changed
// only through operations so two people at the table never overwrite each other.

/** Ids of things inside a sheet (a class row, an item, a feature), made by the browser. */
export const localId = z.string().regex(/^[A-Za-z0-9_-]{1,24}$/, "invalid id");
const text = (max: number) => z.string().max(max);
const short = text(120);
const ability = z.enum(ABILITIES);
const int = (min: number, max: number) => z.number().int().min(min).max(max);
const ref = creatureRefSchema;

const abilityScore = z.object({ base: int(1, 30), bonus: int(-10, 10), override: int(1, 30).nullable() }).strict();

export const classEntrySchema = z
  .object({
    id: localId,
    name: short.min(1),
    subclass: short,
    level: int(1, 20),
    hitDie: z.union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
    caster: z.enum(["full", "half", "third", "pact", "none"]),
    spellAbility: ability.nullable(),
    preparedMax: int(0, 99).nullable(),
    saveProficiencies: z.array(ability).max(6),
  })
  .strict();
export type ClassEntry = z.infer<typeof classEntrySchema>;

const acSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("manual"), value: int(0, 40) }).strict(),
  z.object({ mode: z.literal("unarmored"), extra: ability.nullable(), bonus: int(-10, 20) }).strict(),
  z.object({ mode: z.literal("armor"), base: int(0, 30), dexCap: int(0, 10).nullable(), shield: z.boolean(), bonus: int(-10, 20) }).strict(),
]);

const hpSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("manual"), max: int(1, 2000) }).strict(),
  z.object({ mode: z.literal("average"), bonusPerLevel: int(-10, 20), bonus: int(-100, 500) }).strict(),
]);

export const attackSchema = z
  .object({
    id: localId,
    name: short.min(1),
    ability: z.enum([...ABILITIES, "best-str-dex", "spell", "none"]),
    proficient: z.boolean(),
    toHitBonus: int(-20, 30),
    damage: z.array(z.object({ roll: diceSchema, type: text(30), addAbility: z.boolean() }).strict()).max(4),
    range: text(60),
    properties: text(200),
    notes: text(500),
    itemId: localId.nullable(),
  })
  .strict();
export type Attack = z.infer<typeof attackSchema>;

const resourceMax = z.union([
  int(0, 99),
  z
    .object({
      formula: z.union([z.literal("level"), z.literal("prof"), z.string().regex(/^mod:(str|dex|con|int|wis|cha)$/)]),
      classId: localId.nullable(),
      plus: int(-20, 40),
    })
    .strict(),
]);

export const resourceSchema = z
  .object({
    id: localId,
    name: short.min(1),
    max: resourceMax,
    reset: z.enum(["short", "long", "dawn", "none"]),
    resetAmount: z.union([z.literal("all"), int(1, 99)]),
  })
  .strict();
export type Resource = z.infer<typeof resourceSchema>;

export const itemSchema = z
  .object({
    id: localId,
    name: short.min(1),
    ref: ref.nullable(),
    qty: int(0, 9999),
    weightLb: z.number().min(0).max(10_000),
    equipped: z.boolean(),
    attuned: z.boolean(),
    container: text(60),
    notes: text(1000),
  })
  .strict();
export type SheetItem = z.infer<typeof itemSchema>;

export const spellEntrySchema = z
  .object({
    id: localId,
    ref,
    classId: localId.nullable(),
    status: z.enum(["known", "prepared", "always"]),
    notes: text(500),
  })
  .strict();
export type SpellEntry = z.infer<typeof spellEntrySchema>;

export const companionSchema = z
  .object({
    id: localId,
    name: short.min(1),
    kind: z.enum(["familiar", "companion", "summon", "mount", "other"]),
    ref: ref.nullable(),
    ac: int(0, 40),
    maxHp: int(1, 2000),
    speed: text(60),
    attacks: z.array(z.object({ name: short.min(1), toHit: int(-20, 30), damage: text(40) }).strict()).max(6),
    notes: text(2000),
  })
  .strict();
export type Companion = z.infer<typeof companionSchema>;

export const sheetBodySchema = z
  .object({
    identity: z
      .object({
        name: short.trim().min(1),
        title: short,
        species: short,
        subspecies: short,
        background: short,
        alignment: text(40),
        size: z.enum(["Tiny", "Small", "Medium", "Large"]),
        xp: int(0, 10_000_000),
        milestone: z.boolean(),
        age: text(40),
        height: text(40),
        weight: text(40),
        eyes: text(40),
        hair: text(40),
        skin: text(40),
        pronouns: text(40),
        faith: text(80),
      })
      .strict(),
    classes: z
      .array(classEntrySchema)
      .min(1)
      .max(6)
      .refine((list) => list.reduce((n, c) => n + c.level, 0) <= 20, "the class levels add up to more than 20"),
    abilities: z.object(Object.fromEntries(ABILITIES.map((a) => [a, abilityScore])) as Record<Ability, typeof abilityScore>).strict(),
    proficiencies: z
      .object({
        saves: z.array(ability).max(6),
        skills: z.object(Object.fromEntries(SKILL_IDS.map((s) => [s, z.enum(["none", "half", "proficient", "expertise"])]))).strict(),
        jackOfAllTrades: z.boolean(),
        armor: z.array(text(60)).max(40),
        weapons: z.array(text(60)).max(40),
        tools: z.array(text(60)).max(40),
        languages: z.array(text(60)).max(40),
      })
      .strict(),
    combat: z
      .object({
        ac: acSchema,
        initiativeBonus: int(-20, 30),
        speed: z.object({ walk: int(0, 500), fly: int(0, 500), swim: int(0, 500), climb: int(0, 500), burrow: int(0, 500) }).strict(),
        hover: z.boolean(),
        hp: hpSchema,
        senses: text(200),
        resistances: z.array(text(40)).max(20),
        immunities: z.array(text(40)).max(20),
        vulnerabilities: z.array(text(40)).max(20),
        attacks: z.array(attackSchema).max(40),
      })
      .strict(),
    features: z
      .array(z.object({ id: localId, name: short.min(1), source: text(80), description: text(20_000), resourceId: localId.nullable() }).strict())
      .max(200),
    feats: z
      .array(z.object({ id: localId, ref: ref.nullable(), name: short.min(1), source: text(80), description: text(20_000), choices: text(500) }).strict())
      .max(60),
    resources: z.array(resourceSchema).max(30),
    inventory: z
      .object({
        items: z.array(itemSchema).max(300),
        currency: z.object({ cp: int(0, 1e7), sp: int(0, 1e7), ep: int(0, 1e7), gp: int(0, 1e7), pp: int(0, 1e7) }).strict(),
        attunementMax: int(0, 6),
        encumbrance: z.enum(["off", "simple", "variant"]),
      })
      .strict(),
    spellcasting: z
      .object({
        entries: z.array(spellEntrySchema).max(400),
        extraSlots: z.array(int(0, 9)).length(9),
      })
      .strict(),
    companions: z.array(companionSchema).max(10),
    backstory: z
      .object({
        personalityTraits: text(5000),
        ideals: text(5000),
        bonds: text(5000),
        flaws: text(5000),
        appearance: text(5000),
        backstory: text(50_000),
        alliesAndOrganizations: text(10_000),
        treasure: text(5000),
        goals: text(5000),
        secretsForDm: text(10_000),
      })
      .strict(),
    notes: text(50_000),
  })
  .strict();

export type SheetBody = z.infer<typeof sheetBodySchema>;

export const MAX_BODY_BYTES = 256 * 1024;

const emptyAbility = { base: 10, bonus: 0, override: null };

/** A minimal valid body for a new sheet. */
export function newBody(name: string): SheetBody {
  return {
    identity: {
      name: name.trim().slice(0, 120) || "New character",
      title: "",
      species: "",
      subspecies: "",
      background: "",
      alignment: "",
      size: "Medium",
      xp: 0,
      milestone: true,
      age: "",
      height: "",
      weight: "",
      eyes: "",
      hair: "",
      skin: "",
      pronouns: "",
      faith: "",
    },
    classes: [{ id: "c1", name: "Fighter", subclass: "", level: 1, hitDie: 10, caster: "none", spellAbility: null, preparedMax: null, saveProficiencies: ["str", "con"] }],
    abilities: { str: { ...emptyAbility }, dex: { ...emptyAbility }, con: { ...emptyAbility }, int: { ...emptyAbility }, wis: { ...emptyAbility }, cha: { ...emptyAbility } },
    proficiencies: {
      saves: [],
      skills: Object.fromEntries(SKILL_IDS.map((s) => [s, "none"])) as SheetBody["proficiencies"]["skills"],
      jackOfAllTrades: false,
      armor: [],
      weapons: [],
      tools: [],
      languages: ["Common"],
    },
    combat: {
      ac: { mode: "unarmored", extra: null, bonus: 0 },
      initiativeBonus: 0,
      speed: { walk: 30, fly: 0, swim: 0, climb: 0, burrow: 0 },
      hover: false,
      hp: { mode: "average", bonusPerLevel: 0, bonus: 0 },
      senses: "",
      resistances: [],
      immunities: [],
      vulnerabilities: [],
      attacks: [],
    },
    features: [],
    feats: [],
    resources: [],
    inventory: { items: [], currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, attunementMax: 3, encumbrance: "off" },
    spellcasting: { entries: [], extraSlots: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
    companions: [],
    backstory: {
      personalityTraits: "",
      ideals: "",
      bonds: "",
      flaws: "",
      appearance: "",
      backstory: "",
      alliesAndOrganizations: "",
      treasure: "",
      goals: "",
      secretsForDm: "",
    },
    notes: "",
  };
}
