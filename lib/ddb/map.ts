import { listSrdSpells } from "@/lib/dm/srdSpells";
import { diceSchema } from "@/lib/dm/spells";
import { newBody, sheetBodySchema, type ClassEntry, type SheetBody } from "@/lib/sheets/body";
import { ABILITIES, modifier, SKILL_IDS, srdClass, type Ability, type Edition } from "@/lib/sheets/rules";
import { vitalsSchema, type Condition, type Vitals } from "@/lib/sheets/vitals";

// The one place that knows what a D&D Beyond character looks like. The shape is
// unofficial (see docs/superpowers/specs/ddb-capture-notes.md); when D&D Beyond
// changes it, fix this file and its fixtures in tests/fixtures/ddb. Nothing here
// may throw: anything unreadable becomes a default plus a warning, or { ok: false }.

export type SyncedVitals = Pick<Vitals, "hp" | "tempHp" | "deathSaves" | "stable" | "slotsSpent" | "pactSpent" | "conditions" | "exhaustion" | "inspiration" | "resourcesUsed" | "hitDiceSpent">;
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

/** A short field (age, height...): a number or text, cut to 40 characters. */
const shortField = (v: unknown): string => (typeof v === "number" && Number.isFinite(v) ? String(Math.trunc(v)) : text(v, 40));

/** Backstory, personality, notes and the looks. D&D Beyond keeps these as free text (some HTML). */
function mapStory(data: Obj): Pick<SheetBody, "backstory" | "notes"> & { looks: Partial<SheetBody["identity"]> } {
  const traits = obj(data.traits);
  const notes = obj(data.notes);
  const field = (v: unknown, max: number) => rich(v, max);
  const labelled = (pairs: Array<[string, unknown]>) =>
    pairs
      .map(([label, v]) => [label, field(v, 4000)] as const)
      .filter(([, v]) => v)
      .map(([label, v]) => `${label}: ${v}`)
      .join("\n")
      .slice(0, 10_000);
  const backstory = newBody("x").backstory;
  return {
    backstory: {
      ...backstory,
      personalityTraits: field(traits.personalityTraits, 5000),
      ideals: field(traits.ideals, 5000),
      bonds: field(traits.bonds, 5000),
      flaws: field(traits.flaws, 5000),
      appearance: field(traits.appearance, 5000),
      backstory: field(notes.backstory, 50_000),
      alliesAndOrganizations: labelled([
        ["Allies", notes.allies],
        ["Organizations", notes.organizations],
        ["Enemies", notes.enemies],
      ]),
      treasure: [field(notes.personalPossessions, 2500), field(notes.otherHoldings, 2500)].filter(Boolean).join("\n"),
    },
    notes: field(notes.otherNotes, 50_000),
    looks: { age: shortField(data.age), hair: shortField(data.hair), eyes: shortField(data.eyes), skin: shortField(data.skin), height: shortField(data.height), weight: shortField(data.weight), faith: text(data.faith, 80) },
  };
}

const compact = (v: string) => v.toLowerCase().replace(/[^a-z]/g, "");
const SKILL_KEYS = new Set(SKILL_IDS.map(compact));
const WEAPONS = new Set(
  "club dagger greatclub handaxe javelin lighthammer mace quarterstaff sickle spear dart shortbow sling lightcrossbow handcrossbow heavycrossbow longbow longsword shortsword rapier scimitar battleaxe flail glaive greataxe greatsword halberd lance maul morningstar pike trident warhammer warpick whip blowgun net".split(" "),
);
const labelOf = (m: Obj): string => text(m.friendlySubtypeName, 60) || text(m.subType, 60).replace(/-/g, " ");
const unique = (items: string[], max: number): string[] => [...new Set(items.filter(Boolean))].slice(0, max);

/** Languages, armor, weapon and tool proficiencies, and Jack of All Trades. */
function mapProficiencies(mods: Obj[]): Pick<SheetBody["proficiencies"], "armor" | "weapons" | "tools" | "languages" | "jackOfAllTrades"> {
  const armor: string[] = [];
  const weapons: string[] = [];
  const tools: string[] = [];
  for (const m of mods) {
    if (m.type !== "proficiency" || typeof m.subType !== "string") continue;
    const key = compact(m.subType);
    if (SKILL_KEYS.has(key) || /savingthrows?$/.test(key)) continue;
    if (/armor|shield/.test(key)) armor.push(labelOf(m));
    else if (/weapons?$/.test(key) || WEAPONS.has(key)) weapons.push(labelOf(m));
    else tools.push(labelOf(m));
  }
  return {
    armor: unique(armor, 40),
    weapons: unique(weapons, 40),
    tools: unique(tools, 40),
    languages: unique(mods.filter((m) => m.type === "language").map(labelOf), 40),
    jackOfAllTrades: mods.some((m) => m.type === "half-proficiency" && m.subType === "ability-checks"),
  };
}

const SENSES = ["darkvision", "blindsight", "tremorsense", "truesight"];
const MOVES = { walk: "walking", fly: "flying", swim: "swimming", climb: "climbing", burrow: "burrowing" } as const;

/** Senses, speeds, and damage resistances, immunities and vulnerabilities. */
function mapDefenses(data: Obj, mods: Obj[]): Pick<SheetBody["combat"], "senses" | "speed" | "resistances" | "immunities" | "vulnerabilities"> {
  const senses = new Map<string, number>();
  for (const m of mods) {
    if ((m.type !== "set-base" && m.type !== "sense") || typeof m.subType !== "string" || !SENSES.includes(m.subType) || typeof m.value !== "number") continue;
    senses.set(m.subType, Math.max(senses.get(m.subType) ?? 0, whole(m.value, 0, 1000, 0)));
  }
  const normal = obj(obj(obj(data.race).weightSpeeds).normal);
  const speed = { walk: 30, fly: 0, swim: 0, climb: 0, burrow: 0 };
  for (const move of Object.keys(MOVES) as Array<keyof typeof MOVES>) {
    speed[move] = whole(normal[move], 0, 500, speed[move]);
    for (const m of mods) {
      if ((m.type === "set" || m.type === "set-base") && m.subType === `innate-speed-${MOVES[move]}` && typeof m.value === "number") speed[move] = Math.max(speed[move], whole(m.value, 0, 500, 0));
    }
  }
  const defense = (type: string) =>
    unique(
      mods
        .filter((m) => m.type === type && typeof m.subType === "string")
        .map((m) => {
          const restriction = text(m.restriction, 200);
          return (restriction ? `${labelOf(m)} (${restriction})` : labelOf(m)).slice(0, 40);
        }),
      20,
    );
  return {
    senses: [...senses].map(([sense, range]) => `${sense[0].toUpperCase()}${sense.slice(1)} ${range} ft.`).join(", ").slice(0, 200),
    speed,
    resistances: defense("resistance"),
    immunities: defense("immunity"),
    vulnerabilities: defense("vulnerability"),
  };
}

/** Equipped weapons as attacks: dice, damage type, range, properties and a plus from the weapon itself. */
function mapAttacks(data: Obj, mods: Obj[]): SheetBody["combat"]["attacks"] {
  const proficient = new Set(mods.filter((m) => m.type === "proficiency" && typeof m.subType === "string").map((m) => compact(m.subType as string)));
  const attacks: SheetBody["combat"]["attacks"] = [];
  list(data.inventory)
    .map(obj)
    .forEach((entry, index) => {
      const def = obj(entry.definition);
      const name = text(def.name, 120);
      if (entry.equipped !== true || !name || def.filterType !== "Weapon" || (def.attackType !== 1 && def.attackType !== 2)) return;
      const props = list(def.properties).map((p) => text(obj(p).name, 40)).filter(Boolean);
      const finesse = props.includes("Finesse");
      const near = whole(def.range, 0, 1000, 5);
      const far = whole(def.longRange, 0, 10_000, near);
      const roll = diceSchema.safeParse(obj(def.damage).diceString);
      const magic = list(def.grantedModifiers)
        .map(obj)
        .filter((m) => m.type === "bonus" && m.subType === "magic" && typeof m.value === "number")
        .reduce((n, m) => n + whole(m.value, -10, 10, 0), 0);
      const known = proficient.has(compact(text(def.type, 60))) || (def.categoryId === 1 && proficient.has("simpleweapons")) || (def.categoryId === 2 && proficient.has("martialweapons"));
      const id = typeof entry.id === "number" && entry.id >= 0 ? Math.trunc(entry.id) : null;
      attacks.push({
        id: id === null ? `w${index + 1}` : `w${id}`.slice(0, 24),
        name,
        ability: finesse ? "best-str-dex" : def.attackType === 2 ? "dex" : "str",
        proficient: known,
        toHitBonus: whole(magic, -20, 30, 0),
        damage: roll.success ? [{ roll: roll.data, type: text(def.damageType, 30), addAbility: true }] : [],
        range: far > near ? `${near}/${far} ft.` : `${near} ft.`,
        properties: props.join(", ").slice(0, 200),
        notes: magic !== 0 ? `Magic ${magic > 0 ? "+" : ""}${magic}: add ${magic} to the damage too.` : "",
        itemId: id === null ? null : `d${id}`.slice(0, 24),
      });
    });
  return attacks.slice(0, 40);
}

const RESETS: Record<number, SheetBody["resources"][number]["reset"]> = { 1: "short", 2: "long", 3: "dawn" };
const MAX_RESOURCES = 30;

/** Features with a limited number of uses (Arcane Recovery, Ki...): the resource, and how many are spent. */
function mapResources(data: Obj, features: SheetBody["features"], warnings: string[], abilityMod: (statId: number) => number, proficiency: number): { resources: SheetBody["resources"]; used: Record<string, number> } {
  const resources: SheetBody["resources"] = [];
  const used: Record<string, number> = {};
  const actions = obj(data.actions);
  for (const group of Object.keys(actions)) {
    for (const action of list(actions[group]).map(obj)) {
      const limited = obj(action.limitedUse);
      const statId = typeof limited.statModifierUsesId === "number" ? limited.statModifierUsesId : 0;
      // D&D Beyond adds the ability modifier and/or the proficiency bonus to the listed uses.
      const extra = (statId >= 1 && statId <= 6 ? abilityMod(statId) : 0) + (limited.useProficiencyBonus === true ? proficiency : 0);
      const max = whole(whole(limited.maxUses, 0, 99, 0) + (extra > 0 ? extra : 0), 0, 99, 0);
      const name = text(action.name, 120);
      if (!name || max < 1 || typeof action.componentId !== "number") continue;
      const id = `x${Math.trunc(action.componentId)}`.slice(0, 24);
      if (resources.some((r) => r.id === id)) continue;
      resources.push({ id, name, max, reset: RESETS[whole(limited.resetType, 0, 99, 0)] ?? "none", resetAmount: "all" });
      const spent = whole(limited.numberUsed, 0, max, 0);
      if (spent > 0) used[id] = spent;
      const feature = features.find((f) => [`f${action.componentId}`, `r${action.componentId}`, `o${action.componentId}`].includes(f.id));
      if (feature) feature.resourceId = id;
    }
  }
  if (resources.length > MAX_RESOURCES) warnings.push(`Only the first ${MAX_RESOURCES} limited-use features were copied from D&D Beyond.`);
  return { resources: resources.slice(0, MAX_RESOURCES), used };
}

/** Hit dice spent, added up per die size over the classes. */
function hitDiceSpent(data: Obj, classes: ClassEntry[]): SyncedVitals["hitDiceSpent"] {
  const spent = { 6: 0, 8: 0, 10: 0, 12: 0 };
  list(data.classes)
    .slice(0, 6)
    .forEach((entry, index) => {
      const die = classes[index]?.hitDie;
      if (die) spent[die] = Math.min(10_000, spent[die] + whole(obj(entry).hitDiceUsed, 0, classes[index].level, 0));
    });
  return spent;
}

const MAX_SPELLS = 400;
const SPELL_RANK = { known: 0, prepared: 1, always: 2 } as const;

/**
 * Spells with a bundled SRD page are linked (by name, in the sheet's edition first);
 * the rest cannot be linked, so they are listed by name at the end of the notes.
 */
function mapSpells(data: Obj, classes: ClassEntry[], edition: Edition, warnings: string[]): { entries: SheetBody["spellcasting"]["entries"]; unlinked: string[] } {
  const norm = (n: string) => n.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim();
  const bySlug = new Map<string, { slug: string; edition: Edition }>();
  for (const sp of [...listSrdSpells()].sort((a, b) => Number(a.edition === edition) - Number(b.edition === edition))) bySlug.set(norm(sp.name), { slug: sp.slug, edition: sp.edition });
  const classIdOf = new Map<unknown, string>(list(data.classes).slice(0, 6).map((c, i) => [obj(c).id, classes[i]?.id ?? ""] as [unknown, string]));

  const found = new Map<string, SheetBody["spellcasting"]["entries"][number]>();
  const unlinked = new Map<string, { level: number; prepared: boolean }>();
  const take = (raw: unknown, classId: string | null, always: boolean) => {
    const spell = obj(raw);
    const def = obj(spell.definition);
    const name = text(def.name, 120);
    if (!name) return;
    const hit = bySlug.get(norm(name));
    if (!hit) return void unlinked.set(name, { level: whole(def.level, 0, 9, 0), prepared: spell.prepared === true || spell.alwaysPrepared === true || always });
    const status: SheetBody["spellcasting"]["entries"][number]["status"] = always || spell.alwaysPrepared === true ? "always" : spell.prepared === true ? "prepared" : "known";
    const key = `${hit.edition}/${hit.slug}/${classId ?? ""}`;
    const old = found.get(key);
    if (old) {
      if (SPELL_RANK[status] > SPELL_RANK[old.status]) old.status = status;
      return;
    }
    found.set(key, { id: `s${found.size + 1}`, ref: { source: "srd", edition: hit.edition, slug: hit.slug }, classId, status, notes: "" });
  };

  for (const group of list(data.classSpells).map(obj)) {
    const classId = classIdOf.get(group.characterClassId) || null;
    for (const spell of list(group.spells)) take(spell, classId, false);
  }
  const other = obj(data.spells);
  for (const key of Object.keys(other)) for (const spell of list(other[key])) take(spell, null, true);

  const entries = [...found.values()];
  if (entries.length > MAX_SPELLS) warnings.push(`Only the first ${MAX_SPELLS} spells were copied from D&D Beyond.`);
  return { entries: entries.slice(0, MAX_SPELLS), unlinked: [...unlinked].map(([name, { level, prepared }]) => `${name} (${level === 0 ? "cantrip" : `level ${level}`}${prepared && level > 0 ? ", prepared" : ""})`) };
}

const MAX_SHEET_BYTES = 1_000_000;

/** A sheet is loaded whole by every page that shows it: past 1 MB, long feature and feat descriptions are cut short. */
function shrinkToFit(body: SheetBody, warnings: string[]): void {
  if (JSON.stringify(body).length <= MAX_SHEET_BYTES) return;
  for (const limit of [4000, 1500, 500, 0]) {
    for (const item of [...body.features, ...body.feats]) item.description = item.description.slice(0, limit);
    if (JSON.stringify(body).length <= MAX_SHEET_BYTES) break;
  }
  warnings.push("The character was very large, so long feature and feat descriptions were shortened.");
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

    const modern = obj(data.race).isLegacy === false && list(data.classes).every((c) => obj(obj(c).definition).isLegacy !== true);
    const edition: Edition = modern ? "2024" : "2014";

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

    const proficiency = 2 + Math.floor((totalLevel - 1) / 4);
    const limited = mapResources(data, body.features, warnings, (statId) => modifier(score(ABILITIES[statId - 1])), proficiency);
    body.resources = limited.resources;

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

    const story = mapStory(data);
    body.identity = { ...body.identity, ...story.looks };
    body.backstory = story.backstory;

    const mods = modifiersOf(data);
    Object.assign(body.proficiencies, mapProficiencies(mods));
    Object.assign(body.combat, mapDefenses(data, mods));
    body.combat.attacks = mapAttacks(data, mods);
    const spells = mapSpells(data, classes, edition, warnings);
    body.spellcasting = { ...body.spellcasting, entries: spells.entries };
    const unlinkedText = spells.unlinked.length > 0 ? `Spells not in the SRD (not linked): ${spells.unlinked.join(", ")}` : "";
    body.notes = [story.notes, unlinkedText].filter(Boolean).join("\n\n").slice(0, 50_000);
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
      hitDiceSpent: hitDiceSpent(data, classes),
      resourcesUsed: Object.fromEntries(Object.entries(limited.used).filter(([id]) => limited.resources.some((r) => r.id === id))),
    };

    shrinkToFit(body, warnings);
    const parsedBody = sheetBodySchema.safeParse(body);
    if (!parsedBody.success) return { ok: false, reason: `sheet did not validate: ${parsedBody.error.issues[0]?.message ?? "invalid"}` };
    const checked = vitalsSchema.pick({ hp: true, tempHp: true, deathSaves: true, stable: true, slotsSpent: true, pactSpent: true, conditions: true, exhaustion: true, inspiration: true, resourcesUsed: true, hitDiceSpent: true }).safeParse(vitals);
    if (!checked.success) return { ok: false, reason: `vitals did not validate: ${checked.error.issues[0]?.message ?? "invalid"}` };
    return { ok: true, mapped: { body: parsedBody.data, vitals: checked.data, edition, name, warnings } };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "unreadable character" };
  }
}
