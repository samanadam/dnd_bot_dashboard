import type { SheetBody } from "./body";
import { ABILITIES, ABILITY_NAMES, defaultPrepared, modifier, pactSlots, proficiencyBonus, SKILL_IDS, SKILLS, SLOT_TABLE, type Ability, type Edition, type Skill } from "./rules";
import type { Vitals } from "./vitals";

// Every number on a sheet, worked out from what the player typed. Pure, so the
// page, the server and the combat tracker all agree. Nothing derived is stored.

export type Derived = {
  totalLevel: number;
  proficiency: number;
  abilities: Record<Ability, { score: number; mod: number }>;
  saves: Record<Ability, { bonus: number; proficient: boolean; why: string }>;
  skills: Record<Skill, { bonus: number; ability: Ability; level: "none" | "half" | "proficient" | "expertise"; why: string }>;
  passive: { perception: number; investigation: number; insight: number };
  initiative: { bonus: number; why: string };
  ac: { value: number; why: string };
  maxHp: number;
  speed: { walk: number; fly: number; swim: number; climb: number; burrow: number };
  hitDice: Array<{ die: 6 | 8 | 10 | 12; total: number; left: number }>;
  casting: Array<{ classId: string; name: string; ability: Ability; dc: number; attack: number; prepared: number; preparedMax: number | null }>;
  slots: number[];
  slotsLeft: number[];
  pact: { count: number; level: number; left: number };
  attacks: Array<{ id: string; toHit: number | null; damage: string[] }>;
  resources: Array<{ id: string; name: string; max: number; used: number; left: number }>;
  carrying: { weight: number; capacity: number; state: "fine" | "encumbered" | "heavily" | "over" };
  attunement: { used: number; max: number };
  exhaustion: { level: number; d20Penalty: number; disadvantageOnChecks: boolean; disadvantageOnAttacksAndSaves: boolean };
};

const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));

function casterLevel(edition: Edition, classes: SheetBody["classes"]): number {
  const casters = classes.filter((c) => c.caster === "full" || c.caster === "half" || c.caster === "third");
  if (casters.length === 0) return 0;
  if (casters.length === 1) {
    const c = casters[0];
    if (c.caster === "full") return c.level;
    if (c.caster === "half") return edition === "2014" ? (c.level < 2 ? 0 : Math.ceil(c.level / 2)) : Math.ceil(c.level / 2);
    return c.level < 3 ? 0 : Math.ceil(c.level / 3);
  }
  let level = 0;
  for (const c of casters) {
    if (c.caster === "full") level += c.level;
    else if (c.caster === "half") level += edition === "2014" ? Math.floor(c.level / 2) : Math.ceil(c.level / 2);
    else level += Math.floor(c.level / 3);
  }
  return level;
}

/** The standard slots a set of classes gets (Pact Magic is separate). */
export function slotsFor(edition: Edition, classes: SheetBody["classes"]): number[] {
  const level = Math.min(20, casterLevel(edition, classes));
  return level === 0 ? [0, 0, 0, 0, 0, 0, 0, 0, 0] : [...SLOT_TABLE[level - 1]];
}

function averageHp(body: SheetBody, conMod: number): number {
  const hp = body.combat.hp;
  if (hp.mode === "manual") return hp.max;
  const [first, ...rest] = body.classes;
  let total = first.hitDie + conMod + hp.bonusPerLevel;
  const extraFirst = first.level - 1;
  total += extraFirst * (Math.floor(first.hitDie / 2) + 1 + conMod + hp.bonusPerLevel);
  for (const c of rest) total += c.level * (Math.floor(c.hitDie / 2) + 1 + conMod + hp.bonusPerLevel);
  return total + hp.bonus;
}

export function derive(body: SheetBody, vitals: Vitals, edition: Edition): Derived {
  const totalLevel = Math.max(1, Math.min(20, body.classes.reduce((n, c) => n + c.level, 0)));
  const proficiency = proficiencyBonus(totalLevel);

  const abilities = Object.fromEntries(
    ABILITIES.map((a) => {
      const entry = body.abilities[a];
      const score = entry.override ?? Math.max(1, Math.min(30, entry.base + entry.bonus));
      return [a, { score, mod: modifier(score) }];
    }),
  ) as Derived["abilities"];

  // Exhaustion. 2014: a cumulative table. 2024: -2 per level on every d20 test, -5 ft per level of speed.
  const ex = vitals.exhaustion;
  const exhaustion: Derived["exhaustion"] = {
    level: ex,
    d20Penalty: edition === "2024" ? -2 * ex : 0,
    disadvantageOnChecks: edition === "2014" && ex >= 1,
    disadvantageOnAttacksAndSaves: edition === "2014" && ex >= 3,
  };
  const d20 = exhaustion.d20Penalty;

  const saveProf = new Set([...(body.classes[0]?.saveProficiencies ?? []), ...body.proficiencies.saves]);
  const saves = Object.fromEntries(
    ABILITIES.map((a) => {
      const proficient = saveProf.has(a);
      const bonus = abilities[a].mod + (proficient ? proficiency : 0) + d20;
      const why = [`${ABILITY_NAMES[a]} ${signed(abilities[a].mod)}`, proficient ? `proficient ${signed(proficiency)}` : "", d20 ? `exhaustion ${d20}` : ""].filter(Boolean).join(", ");
      return [a, { bonus, proficient, why }];
    }),
  ) as Derived["saves"];

  const jack = body.proficiencies.jackOfAllTrades;
  const half = Math.floor(proficiency / 2);
  const skills = Object.fromEntries(
    SKILL_IDS.map((skill) => {
      const ability = SKILLS[skill].ability;
      const level = body.proficiencies.skills[skill];
      const extra = level === "expertise" ? proficiency * 2 : level === "proficient" ? proficiency : level === "half" || jack ? half : 0;
      const label = level === "expertise" ? "expertise" : level === "proficient" ? "proficient" : extra ? "half proficiency" : "";
      const bonus = abilities[ability].mod + extra + d20;
      const why = [`${ABILITY_NAMES[ability]} ${signed(abilities[ability].mod)}`, label ? `${label} ${signed(extra)}` : "", d20 ? `exhaustion ${d20}` : ""].filter(Boolean).join(", ");
      return [skill, { bonus, ability, level, why }];
    }),
  ) as Derived["skills"];

  const initiativeExtra = jack ? half : 0;
  const initiative = {
    bonus: abilities.dex.mod + body.combat.initiativeBonus + initiativeExtra + d20,
    why: [`Dexterity ${signed(abilities.dex.mod)}`, body.combat.initiativeBonus ? `bonus ${signed(body.combat.initiativeBonus)}` : "", initiativeExtra ? `Jack of All Trades ${signed(initiativeExtra)}` : "", d20 ? `exhaustion ${d20}` : ""]
      .filter(Boolean)
      .join(", "),
  };

  const acRule = body.combat.ac;
  const ac =
    acRule.mode === "manual"
      ? { value: acRule.value, why: "set by hand" }
      : acRule.mode === "unarmored"
        ? {
            value: 10 + abilities.dex.mod + (acRule.extra ? abilities[acRule.extra].mod : 0) + acRule.bonus,
            why: ["10", `Dexterity ${signed(abilities.dex.mod)}`, acRule.extra ? `${ABILITY_NAMES[acRule.extra]} ${signed(abilities[acRule.extra].mod)}` : "", acRule.bonus ? `bonus ${signed(acRule.bonus)}` : ""].filter(Boolean).join(", "),
          }
        : (() => {
            const dex = acRule.dexCap === null ? abilities.dex.mod : Math.min(abilities.dex.mod, acRule.dexCap);
            return {
              value: acRule.base + dex + (acRule.shield ? 2 : 0) + acRule.bonus,
              why: [`armor ${acRule.base}`, `Dexterity ${signed(dex)}`, acRule.shield ? "shield +2" : "", acRule.bonus ? `bonus ${signed(acRule.bonus)}` : ""].filter(Boolean).join(", "),
            };
          })();

  let maxHp = Math.max(1, averageHp(body, abilities.con.mod) + vitals.maxHpAdjust);
  if (edition === "2014" && ex >= 4) maxHp = Math.max(1, Math.floor(maxHp / 2));

  const baseSpeed = body.combat.speed;
  const speedFactor = edition === "2014" ? (ex >= 5 ? 0 : ex >= 2 ? 0.5 : 1) : 1;
  const speedLoss = edition === "2024" ? 5 * ex : 0;
  const speed = Object.fromEntries(
    Object.entries(baseSpeed).map(([kind, value]) => [kind, value === 0 ? 0 : Math.max(0, Math.floor(value * speedFactor) - speedLoss)]),
  ) as Derived["speed"];

  const dice = new Map<6 | 8 | 10 | 12, number>();
  for (const c of body.classes) dice.set(c.hitDie, (dice.get(c.hitDie) ?? 0) + c.level);
  const hitDice = [...dice.entries()]
    .sort(([a], [b]) => b - a)
    .map(([die, total]) => ({ die, total, left: Math.max(0, total - vitals.hitDiceSpent[die]) }));

  const casting = body.classes
    .filter((c) => c.spellAbility !== null && c.caster !== "none")
    .map((c) => {
      const ability = c.spellAbility!;
      return {
        classId: c.id,
        name: c.name,
        ability,
        dc: 8 + proficiency + abilities[ability].mod,
        attack: proficiency + abilities[ability].mod + d20,
        prepared: body.spellcasting.entries.filter((e) => e.classId === c.id && e.status === "prepared").length,
        preparedMax: c.preparedMax ?? defaultPrepared(edition, c.name, c.level, abilities[ability].mod),
      };
    });

  const slots = slotsFor(edition, body.classes).map((n, i) => n + body.spellcasting.extraSlots[i]);
  const slotsLeft = slots.map((n, i) => Math.max(0, n - vitals.slotsSpent[i]));
  const warlock = body.classes.filter((c) => c.caster === "pact").reduce((n, c) => n + c.level, 0);
  const pactInfo = pactSlots(warlock);
  const pact = { ...pactInfo, left: Math.max(0, pactInfo.count - vitals.pactSpent) };

  const spellAttack = casting[0]?.attack ?? proficiency + d20;
  const attacks = body.combat.attacks.map((attack) => {
    const mod =
      attack.ability === "none" || attack.ability === "spell"
        ? 0
        : attack.ability === "best-str-dex"
          ? Math.max(abilities.str.mod, abilities.dex.mod)
          : abilities[attack.ability].mod;
    const toHit = attack.ability === "spell" ? spellAttack + attack.toHitBonus : mod + (attack.proficient ? proficiency : 0) + attack.toHitBonus + d20;
    const damage = attack.damage.map((d) => {
      const add = d.addAbility && attack.ability !== "none" && attack.ability !== "spell" ? mod : 0;
      return `${d.roll}${add ? (add > 0 ? `+${add}` : add) : ""}${d.type ? ` ${d.type}` : ""}`;
    });
    return { id: attack.id, toHit, damage };
  });

  const resources = body.resources.map((resource) => {
    let max: number;
    if (typeof resource.max === "number") max = resource.max;
    else {
      const owner = resource.max.classId ? body.classes.find((c) => c.id === resource.max.classId) : null;
      const formula = resource.max.formula;
      const base = formula === "level" ? (owner?.level ?? totalLevel) : formula === "prof" ? proficiency : abilities[formula.slice(4) as Ability].mod;
      max = Math.max(1, base + resource.max.plus);
    }
    const used = Math.min(max, vitals.resourcesUsed[resource.id] ?? 0);
    return { id: resource.id, name: resource.name, max, used, left: max - used };
  });

  const weight = Math.round(body.inventory.items.reduce((n, item) => n + item.qty * item.weightLb, 0) * 100) / 100;
  const sizeFactor = body.identity.size === "Tiny" ? 0.5 : body.identity.size === "Large" ? 2 : 1;
  const str = abilities.str.score;
  const capacity = str * 15 * sizeFactor;
  let state: Derived["carrying"]["state"] = "fine";
  if (weight > capacity) state = "over";
  else if (body.inventory.encumbrance === "variant") state = weight > str * 10 * sizeFactor ? "heavily" : weight > str * 5 * sizeFactor ? "encumbered" : "fine";

  return {
    totalLevel,
    proficiency,
    abilities,
    saves,
    skills,
    passive: { perception: 10 + skills.perception.bonus, investigation: 10 + skills.investigation.bonus, insight: 10 + skills.insight.bonus },
    initiative,
    ac,
    maxHp,
    speed,
    hitDice,
    casting,
    slots,
    slotsLeft,
    pact,
    attacks,
    resources,
    carrying: { weight, capacity, state: body.inventory.encumbrance === "off" && state !== "over" ? "fine" : state },
    attunement: { used: body.inventory.items.filter((item) => item.attuned).length, max: body.inventory.attunementMax },
    exhaustion,
  };
}

/** The roll for a spell's effect at a slot level (levelled spells) or character level (cantrips). */
export function scaledRoll(
  spell: { level: number; effect: { roll: string } | null; scaling: { by: "slot" | "character"; steps: { at: number; roll: string }[] } | null },
  slotLevel: number,
  characterLevel: number,
): string | null {
  if (!spell.effect) return null;
  if (!spell.scaling) return spell.effect.roll;
  const at = spell.scaling.by === "slot" ? slotLevel : characterLevel;
  let roll = spell.effect.roll;
  for (const step of spell.scaling.steps) if (at >= step.at) roll = step.roll;
  return roll;
}
