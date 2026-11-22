import { newBody, sheetBodySchema, type ClassEntry, type SheetBody } from "@/lib/sheets/body";
import { ABILITIES, modifier, SKILL_IDS, srdClass, type Ability, type Edition } from "@/lib/sheets/rules";
import { vitalsSchema, type Condition, type Vitals } from "@/lib/sheets/vitals";

// The one place that knows what a D&D Beyond character looks like. The shape is
// unofficial (see docs/superpowers/specs/ddb-capture-notes.md); when D&D Beyond
// changes it, fix this file and its fixtures in tests/fixtures/ddb. Nothing here
// may throw: anything unreadable becomes a default plus a warning, or { ok: false }.

export type SyncedVitals = Pick<Vitals, "hp" | "tempHp" | "deathSaves" | "stable" | "slotsSpent" | "pactSpent" | "conditions" | "exhaustion" | "inspiration" | "concentration">;
export type Mapped = { body: SheetBody; vitals: SyncedVitals; edition: Edition; name: string; warnings: string[] };
export type MapResult = { ok: true; mapped: Mapped } | { ok: false; reason: string };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const whole = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback;
  return Math.min(max, Math.max(min, n));
};
const wholeOrNull = (v: unknown, min: number, max: number): number | null => (typeof v === "number" && Number.isFinite(v) ? whole(v, min, max, min) : null);

const ALIGNMENTS = ["", "Lawful Good", "Neutral Good", "Chaotic Good", "Lawful Neutral", "Neutral", "Chaotic Neutral", "Lawful Evil", "Neutral Evil", "Chaotic Evil"];
const SIZES: Record<number, SheetBody["identity"]["size"]> = { 2: "Tiny", 3: "Small", 4: "Medium", 5: "Large" };
// D&D Beyond condition ids; 4 is exhaustion, which the sheet keeps as a level.
const CONDITION_NAMES: Record<number, string> = { 1: "Blinded", 2: "Charmed", 3: "Deafened", 5: "Frightened", 6: "Grappled", 7: "Incapacitated", 8: "Invisible", 9: "Paralyzed", 10: "Petrified", 11: "Poisoned", 12: "Prone", 13: "Restrained", 14: "Stunned", 15: "Unconscious" };
const ABILITY_WORDS: Record<Ability, string> = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" };
const HIT_DICE = [6, 8, 10, 12] as const;

function statById(v: unknown, id: number): unknown {
  return list(v)
    .map(obj)
    .find((s) => s.id === id)?.value;
}

function modifiersOf(data: Obj): Obj[] {
  return Object.values(obj(data.modifiers)).flatMap((group) => list(group).map(obj));
}

function mapClasses(data: Obj, warnings: string[]): ClassEntry[] {
  const entries = list(data.classes).map(obj).slice(0, 6);
  return entries.map((entry, index) => {
    const def = obj(entry.definition);
    const name = text(def.name, 120) || "Class";
    const subclass = text(obj(entry.subclassDefinition).name, 120);
    const srd = srdClass(name);
    const thirdCaster = /eldritch knight|arcane trickster/i.test(subclass);
    const caster = srd?.caster ?? (thirdCaster ? "third" : def.canCastSpells === true ? "full" : "none");
    if (!srd && !thirdCaster && def.canCastSpells === true) warnings.push(`${name}: assumed a full caster.`);
    const abilityIndex = typeof def.spellCastingAbilityId === "number" ? def.spellCastingAbilityId - 1 : -1;
    const spellAbility = ABILITIES[abilityIndex] ?? (thirdCaster ? "int" : (srd?.spellAbility ?? null));
    const die = HIT_DICE.find((d) => d === def.hitDice) ?? srd?.hitDie ?? 8;
    return {
      id: `c${index + 1}`,
      name,
      subclass,
      level: whole(entry.level, 1, 20, 1),
      hitDie: die,
      caster,
      spellAbility: caster === "none" ? null : spellAbility,
      preparedMax: null,
      saveProficiencies: srd ? [...srd.saves] : [],
    };
  });
}

function armorClass(data: Obj, dexMod: number): number {
  const worn = list(data.inventory)
    .map(obj)
    .filter((item) => item.equipped === true)
    .map((item) => obj(item.definition));
  const body = worn.find((d) => d.armorTypeId === 1 || d.armorTypeId === 2 || d.armorTypeId === 3);
  const shield = worn.find((d) => d.armorTypeId === 4);
  const base = whole(body?.armorClass, 0, 30, 10);
  let ac: number;
  if (!body) ac = 10 + dexMod;
  else if (body.armorTypeId === 1) ac = base + dexMod;
  else if (body.armorTypeId === 2) ac = base + Math.min(dexMod, 2);
  else ac = base;
  return whole(ac + (shield ? whole(shield.armorClass, 0, 10, 2) : 0), 0, 40, 10);
}

export function mapCharacter(raw: unknown): MapResult {
  try {
    const data = obj(obj(raw).data);
    const name = text(data.name, 120);
    if (!name) return { ok: false, reason: "no character name" };
    const warnings: string[] = ["Armor class is worked out from worn armor only: magic items and class features are not counted."];

    const classes = mapClasses(data, warnings);
    if (classes.length === 0) return { ok: false, reason: "no classes" };
    const totalLevel = classes.reduce((n, c) => n + c.level, 0);
    if (totalLevel > 20) return { ok: false, reason: "class levels add up to more than 20" };

    const body = newBody(name);
    body.classes = classes;
    ABILITIES.forEach((ability, index) => {
      const id = index + 1;
      body.abilities[ability] = {
        base: whole(statById(data.stats, id), 1, 30, 10),
        bonus: whole(statById(data.bonusStats, id), -10, 10, 0),
        override: wholeOrNull(statById(data.overrideStats, id), 1, 30),
      };
    });
    const score = (a: Ability) => body.abilities[a].override ?? Math.min(30, Math.max(1, body.abilities[a].base + body.abilities[a].bonus));

    const race = obj(data.race);
    const background = obj(obj(data.background).definition);
    body.identity = {
      ...body.identity,
      name,
      species: text(race.fullName, 120),
      background: text(background.name, 120),
      alignment: ALIGNMENTS[whole(data.alignmentId, 0, 9, 0)] ?? "",
      size: SIZES[whole(race.sizeId, 0, 99, 4)] ?? "Medium",
      xp: whole(data.currentXp, 0, 10_000_000, 0),
    };

    const mods = modifiersOf(data);
    const hasProficiency = (subType: string, type = "proficiency") => mods.some((m) => m.type === type && m.subType === subType);
    body.proficiencies.saves = ABILITIES.filter((a) => hasProficiency(`${ABILITY_WORDS[a]}-saving-throws`));
    for (const skill of SKILL_IDS) {
      body.proficiencies.skills[skill] = hasProficiency(skill, "expertise") ? "expertise" : hasProficiency(skill) ? "proficient" : "none";
    }

    const override = wholeOrNull(data.overrideHitPoints, 1, 2000);
    const computed = whole(data.baseHitPoints, 0, 2000, 0) + modifier(score("con")) * totalLevel + whole(data.bonusHitPoints, -1000, 2000, 0);
    const maxHp = whole(override ?? computed, 1, 2000, 1);
    body.combat.hp = { mode: "manual", max: maxHp };
    body.combat.ac = { mode: "manual", value: armorClass(data, modifier(score("dex"))) };

    const conditionEntries = list(data.conditions).map(obj);
    const conditions: Condition[] = conditionEntries.flatMap((c) => {
      const label = typeof c.id === "number" ? CONDITION_NAMES[c.id] : undefined;
      return label ? [{ name: label, rounds: null }] : [];
    });
    const exhaustion = conditionEntries.find((c) => c.id === 4);
    const deathSaves = obj(data.deathSaves);
    const slotUsed = (level: number) => whole(list(data.spellSlots).map(obj).find((s) => s.level === level)?.used, 0, 20, 0);
    const vitals: SyncedVitals = {
      hp: whole(maxHp - whole(data.removedHitPoints, 0, 100_000, 0), 0, 10_000, maxHp),
      tempHp: whole(data.temporaryHitPoints, 0, 10_000, 0),
      deathSaves: { successes: whole(deathSaves.successCount, 0, 3, 0), failures: whole(deathSaves.failCount, 0, 3, 0) },
      stable: deathSaves.isStabilized === true,
      slotsSpent: Array.from({ length: 9 }, (_, i) => slotUsed(i + 1)),
      pactSpent: whole(list(data.pactMagic).map(obj).reduce((n, s) => n + whole(s.used, 0, 10, 0), 0), 0, 10, 0),
      conditions: conditions.slice(0, 12),
      exhaustion: exhaustion ? whole(exhaustion.level, 0, 6, 1) : 0,
      inspiration: data.inspiration === true,
      concentration: null,
    };

    const modern = race.isLegacy === false && list(data.classes).every((c) => obj(obj(c).definition).isLegacy !== true);
    const edition: Edition = modern ? "2024" : "2014";

    const parsedBody = sheetBodySchema.safeParse(body);
    if (!parsedBody.success) return { ok: false, reason: `sheet did not validate: ${parsedBody.error.issues[0]?.message ?? "invalid"}` };
    const checked = vitalsSchema.pick({ hp: true, tempHp: true, deathSaves: true, stable: true, slotsSpent: true, pactSpent: true, conditions: true, exhaustion: true, inspiration: true, concentration: true }).safeParse(vitals);
    if (!checked.success) return { ok: false, reason: `vitals did not validate: ${checked.error.issues[0]?.message ?? "invalid"}` };
    return { ok: true, mapped: { body: parsedBody.data, vitals: checked.data, edition, name, warnings } };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "unreadable character" };
  }
}
