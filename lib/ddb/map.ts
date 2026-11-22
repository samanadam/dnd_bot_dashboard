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

/**
 * Flat "+N <ability> score" modifiers: the points a feat or background gives (the 2024
 * rules) are stored as modifiers, not in the stored bonus. Conditional and not-granted ones are left out.
 */
function scoreBonuses(data: Obj, ability: Ability): number {
  const subType = `${ABILITY_WORDS[ability]}-score`;
  return modifiersOf(data)
    .filter((m) => m.type === "bonus" && m.subType === subType && typeof m.value === "number" && m.isGranted !== false && !text(m.restriction, 200))
    .reduce((n, m) => n + whole(m.value, -10, 10, 0), 0);
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
  return whole(ac + (shield ? whole(shield.armorClass, 0, 10, 2) : 0) + armorBonuses(data), 0, 40, 10);
}

/**
 * Flat "+N armor class" modifiers: those of worn items (attuned when the item needs
 * it, like Plate +3 or a Ring of Protection) and unconditional ones from the class
 * or feats (a Defense fighting style). Conditional ones are left out.
 */
function armorBonuses(data: Obj): number {
  const modifiers = obj(data.modifiers);
  const worn = new Map<number, boolean>();
  for (const entry of list(data.inventory).map(obj)) {
    const id = obj(entry.definition).id;
    if (entry.equipped === true && typeof id === "number") worn.set(id, entry.isAttuned === true);
  }
  let total = 0;
  for (const [group, entries] of Object.entries(modifiers)) {
    for (const m of list(entries).map(obj)) {
      if (m.type !== "bonus" || m.subType !== "armor-class" || typeof m.value !== "number" || m.isGranted === false || text(m.restriction, 200)) continue;
      if (group === "item") {
        const attuned = typeof m.componentId === "number" ? worn.get(m.componentId) : undefined;
        if (attuned === undefined || (m.requiresAttunement === true && !attuned)) continue;
      }
      total += whole(m.value, -10, 10, 0);
    }
  }
  return total;
}

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&rsquo;": "'", "&lsquo;": "'" };

const decode = (t: string): string =>
  t.replace(/&(?:nbsp|amp|lt|gt|quot|#39|rsquo|lsquo);/g, (e) => ENTITIES[e] ?? e).replace(/&#(\d{1,6});/g, (e, n: string) => (Number(n) < 0x110000 ? String.fromCodePoint(Number(n)) : e));

/** D&D Beyond descriptions are HTML; this is plain text on one line, cut to `max` characters. */
function plain(html: unknown, max: number): string {
  if (typeof html !== "string") return "";
  const withBreaks = html.replace(/<\/(p|li|div|h[1-6]|tr)>|<br\s*\/?>/gi, " ");
  return decode(withBreaks.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * The same HTML as the little formatting the sheet shows (**bold**, _italic_, "- " lists and
 * line breaks; see components/dm/RichText.tsx). Nothing is ever parsed as HTML on the way back.
 */
function rich(html: unknown, max: number): string {
  if (typeof html !== "string") return "";
  const marked = html
    .replace(/<\s*(strong|b)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, "**$2**")
    .replace(/<\s*(em|i)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, "_$2_")
    .replace(/<\s*li\b[^>]*>/gi, "\n- ")
    .replace(/<\s*\/\s*(td|th)\s*>/gi, " | ")
    .replace(/<\s*\/\s*(p|div|h[1-6]|tr|ul|ol|table|blockquote)\s*>|<\s*br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  return decode(marked)
    .replace(/\*\*\s*\*\*|(?<![\w])__(?![\w])/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter((line) => line !== "")
    .join("\n")
    .trim()
    .slice(0, max);
}

const MAX_ITEMS = 300;
const COINS = ["cp", "sp", "ep", "gp", "pp"] as const;

/**
 * Items (D&D Beyond's and the player's custom ones) and coins. Item weight is per item, as on the
 * sheet. An item inside a container is "where" that container's name. The sheet's own carrying
 * rules (attunement slots, encumbrance) are the portal's, so they are left alone.
 */
function mapInventory(data: Obj, warnings: string[]): { items: SheetBody["inventory"]["items"]; currency: SheetBody["inventory"]["currency"] } {
  const entries = list(data.inventory).map(obj);
  const names = new Map<number, string>();
  for (const entry of entries) {
    const name = text(obj(entry.definition).name, 60);
    if (typeof entry.id === "number" && name) names.set(entry.id, name);
  }

  const items: SheetBody["inventory"]["items"] = [];
  entries.forEach((entry, index) => {
    const def = obj(entry.definition);
    const name = text(def.name, 120);
    if (!name) return;
    const container = typeof entry.containerEntityId === "number" ? (names.get(entry.containerEntityId) ?? "") : "";
    items.push({
      id: typeof entry.id === "number" && entry.id >= 0 ? `d${Math.trunc(entry.id)}`.slice(0, 24) : `i${index + 1}`,
      name,
      ref: null,
      qty: whole(entry.quantity, 0, 9999, 1),
      weightLb: weightOf(def.weight),
      equipped: entry.equipped === true,
      attuned: entry.isAttuned === true,
      container,
      notes: plain(def.snippet, 1000) || plain(def.description, 1000),
    });
  });
  list(data.customItems)
    .map(obj)
    .forEach((custom, index) => {
      const name = text(custom.name, 120);
      if (!name) return;
      items.push({
        id: typeof custom.id === "number" && custom.id >= 0 ? `c${Math.trunc(custom.id)}`.slice(0, 24) : `x${index + 1}`,
        name,
        ref: null,
        qty: whole(custom.quantity, 0, 9999, 1),
        weightLb: weightOf(custom.weight),
        equipped: false,
        attuned: false,
        container: "",
        notes: plain(custom.description, 1000) || plain(custom.notes, 1000),
      });
    });
  if (items.length > MAX_ITEMS) warnings.push(`Only the first ${MAX_ITEMS} items were copied from D&D Beyond.`);

  const coins = obj(data.currencies);
  const currency = Object.fromEntries(COINS.map((coin) => [coin, whole(coins[coin], 0, 10_000_000, 0)])) as SheetBody["inventory"]["currency"];
  return { items: items.slice(0, MAX_ITEMS), currency };
}

/** A weight in pounds, 0 to 10 000, to two places. */
const weightOf = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(10_000, Math.max(0, v)) * 100) / 100 : 0);

const MAX_FEATURES = 200;
const MAX_FEATS = 60;

/**
 * Class features up to the level reached (D&D Beyond lists all twenty levels), species traits,
 * the choices made for species and class, a background feature that has its own text, and feats
 * with the choices made on them.
 */
function mapFeatures(data: Obj, warnings: string[]): { features: SheetBody["features"]; feats: SheetBody["feats"] } {
  const features: SheetBody["features"] = [];
  const seen = new Set<string>();
  const add = (id: string, name: string, source: string, description: string) => {
    if (!name || seen.has(id) || !/^[A-Za-z0-9_-]{1,24}$/.test(id)) return;
    seen.add(id);
    features.push({ id, name, source: source.slice(0, 80), description, resourceId: null });
  };
  const idOf = (prefix: string, def: Obj, index: number) => `${prefix}${typeof def.id === "number" && def.id >= 0 ? Math.trunc(def.id) : `n${index + 1}`}`.slice(0, 24);

  for (const entry of list(data.classes).map(obj)) {
    const className = text(obj(entry.definition).name, 60) || "Class";
    const subclass = text(obj(entry.subclassDefinition).name, 60);
    const level = whole(entry.level, 1, 20, 1);
    list(entry.classFeatures)
      .map(obj)
      .forEach((feature, index) => {
        const def = obj(feature.definition);
        const needs = typeof def.requiredLevel === "number" ? Math.trunc(def.requiredLevel) : 1;
        if (def.hideInSheet === true || needs > level) return;
        const label = def.isSubClassFeature === true && subclass ? subclass : className;
        add(idOf("f", def, index), text(def.name, 120), `${label} ${needs}`, rich(def.description, 20_000) || rich(def.snippet, 20_000));
      });
  }

  const race = obj(data.race);
  const raceName = text(race.fullName, 60) || "Species";
  list(race.racialTraits)
    .map(obj)
    .forEach((trait, index) => {
      const def = obj(trait.definition);
      if (def.hideInSheet === true) return;
      add(idOf("r", def, index), text(def.name, 120), raceName, rich(def.description, 20_000) || rich(def.snippet, 20_000));
    });

  const options = obj(data.options);
  for (const [group, label] of [
    ["race", `${raceName} choice`],
    ["class", "Class choice"],
  ] as const) {
    list(options[group])
      .map(obj)
      .forEach((option, index) => {
        const def = obj(option.definition);
        add(idOf("o", def, index), text(def.name, 120), label, rich(def.description, 20_000) || rich(def.snippet, 20_000));
      });
  }

  const background = obj(obj(data.background).definition);
  const backgroundText = rich(background.featureDescription, 20_000);
  if (backgroundText) add("b1", text(background.featureName, 120), `Background: ${text(background.name, 60) || "background"}`, backgroundText);

  const choicesOf = (feat: Obj): string => {
    if (feat.componentId === undefined) return "";
    return list(options.feat)
      .map(obj)
      .filter((o) => o.componentId === feat.componentId && o.componentTypeId === feat.componentTypeId)
      .map((o) => text(obj(o.definition).name, 120))
      .filter(Boolean)
      .join(", ")
      .slice(0, 500);
  };
  const feats: SheetBody["feats"] = [];
  list(data.feats)
    .map(obj)
    .forEach((feat, index) => {
      const def = obj(feat.definition);
      const name = text(def.name, 120);
      const id = idOf("t", def, index);
      if (!name || feats.some((f) => f.id === id)) return;
      feats.push({ id, ref: null, name, source: "Feat", description: rich(def.description, 20_000) || rich(def.snippet, 20_000), choices: choicesOf(feat) });
    });

  if (features.length > MAX_FEATURES) warnings.push(`Only the first ${MAX_FEATURES} features were copied from D&D Beyond.`);
  if (feats.length > MAX_FEATS) warnings.push(`Only the first ${MAX_FEATS} feats were copied from D&D Beyond.`);
  return { features: features.slice(0, MAX_FEATURES), feats: feats.slice(0, MAX_FEATS) };
}

export function mapCharacter(raw: unknown): MapResult {
  try {
    const data = obj(obj(raw).data);
    const name = text(data.name, 120);
    if (!name) return { ok: false, reason: "no character name" };
    const warnings: string[] = ["Armor class is worked out from worn armor and flat bonuses; conditional bonuses and spells are not counted."];

    const classes = mapClasses(data, warnings);
    if (classes.length === 0) return { ok: false, reason: "no classes" };
    const totalLevel = classes.reduce((n, c) => n + c.level, 0);
    if (totalLevel > 20) return { ok: false, reason: "class levels add up to more than 20" };

    const body = newBody(name);
    body.classes = classes;
    body.inventory = { ...body.inventory, ...mapInventory(data, warnings) };
    Object.assign(body, mapFeatures(data, warnings));
    ABILITIES.forEach((ability, index) => {
      const id = index + 1;
      body.abilities[ability] = {
        base: whole(statById(data.stats, id), 1, 30, 10),
        bonus: whole(whole(statById(data.bonusStats, id), -10, 10, 0) + scoreBonuses(data, ability), -10, 10, 0),
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
