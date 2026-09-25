import { z } from "zod";
import type { Rng } from "@/lib/dice/random";

// An encounter is plain data plus pure transitions. The tracker applies them
// locally and autosaves the result; the server only validates and stores it.

export const creatureRefSchema = z.union([
  z.object({ source: z.literal("srd"), edition: z.enum(["2014", "2024"]), slug: z.string().regex(/^[a-z0-9-]{1,80}$/) }).strict(),
  z.object({ source: z.literal("custom"), id: z.string().regex(/^[0-9a-f-]{36}$/) }).strict(),
]);

const conditionSchema = z
  .object({ name: z.string().trim().min(1).max(40), rounds: z.number().int().min(1).max(1000).nullable() })
  .strict();

export const combatantSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
    name: z.string().trim().min(1).max(80),
    kind: z.enum(["monster", "npc", "player"]),
    ref: creatureRefSchema.nullable(),
    initiative: z.number().int().min(-20).max(60).nullable(),
    initiativeBonus: z.number().int().min(-20).max(40),
    ac: z.number().int().min(0).max(40),
    hp: z.number().int().min(0).max(10_000),
    maxHp: z.number().int().min(1).max(10_000),
    tempHp: z.number().int().min(0).max(10_000),
    conditions: z.array(conditionSchema).max(12),
    concentration: z.boolean(),
    // On the party side: a friendly NPC or a summoned ally. Older encounters
    // have no such field and read as false.
    friendly: z.boolean().default(false),
    notes: z.string().max(2000),
  })
  .strict();

export const encounterSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    round: z.number().int().min(0).max(10_000),
    turn: z.number().int().min(0).max(59),
    combatants: z.array(combatantSchema).max(60),
  })
  .strict();

export type CreatureRef = z.infer<typeof creatureRefSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type Combatant = z.infer<typeof combatantSchema>;
export type Encounter = z.infer<typeof encounterSchema>;
export type NewCombatant = Omit<Combatant, "id">;

export const MAX_COMBATANTS = 60;

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : min;

const mapOne = (enc: Encounter, id: string, fn: (c: Combatant) => Combatant): Encounter => ({
  ...enc,
  combatants: enc.combatants.map((c) => (c.id === id ? fn(c) : c)),
});

/**
 * A fresh, not-yet-started copy of an encounter: initiative cleared, everyone
 * at full hit points, no temporary hit points, conditions or concentration.
 * Used to launch a prepared encounter without touching the template.
 */
export function launchCopy(enc: Encounter): Encounter {
  return {
    ...enc,
    round: 0,
    turn: 0,
    combatants: enc.combatants.map((c) => ({
      ...c,
      initiative: null,
      hp: c.maxHp,
      tempHp: 0,
      conditions: [],
      concentration: false,
    })),
  };
}

export function newEncounter(name: string): Encounter {
  return { name, round: 0, turn: 0, combatants: [] };
}

export function addCombatant(enc: Encounter, input: NewCombatant, newId: () => string): Encounter {
  if (enc.combatants.length >= MAX_COMBATANTS) return enc;
  const base = input.name.trim().replace(/\s+\d+$/, "").slice(0, 74) || "Combatant";
  const taken = new Set(enc.combatants.map((c) => c.name));
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base} ${n}`;
  return { ...enc, combatants: [...enc.combatants, { ...input, id: newId(), name }] };
}

export function removeCombatant(enc: Encounter, id: string): Encounter {
  const index = enc.combatants.findIndex((c) => c.id === id);
  if (index < 0) return enc;
  const combatants = enc.combatants.filter((c) => c.id !== id);
  let turn = enc.turn;
  if (index < enc.turn) turn -= 1;
  if (turn >= combatants.length) turn = 0;
  return { ...enc, combatants, turn: Math.max(0, turn) };
}

export function sortByInitiative(enc: Encounter): Encounter {
  const current = enc.combatants[enc.turn]?.id;
  const combatants = [...enc.combatants].sort((a, b) => {
    if (a.initiative === null && b.initiative === null) return 0;
    if (a.initiative === null) return 1;
    if (b.initiative === null) return -1;
    return b.initiative - a.initiative || b.initiativeBonus - a.initiativeBonus || a.name.localeCompare(b.name);
  });
  if (enc.round === 0) return { ...enc, combatants, turn: 0 };
  return { ...enc, combatants, turn: Math.max(0, combatants.findIndex((c) => c.id === current)) };
}

export function setInitiative(enc: Encounter, id: string, value: number | null): Encounter {
  return sortByInitiative(mapOne(enc, id, (c) => ({ ...c, initiative: value === null ? null : clamp(value, -20, 60) })));
}

export function rollInitiative(enc: Encounter, ids: readonly string[], rng: Rng): Encounter {
  const wanted = new Set(ids);
  return sortByInitiative({
    ...enc,
    combatants: enc.combatants.map((c) =>
      wanted.has(c.id) ? { ...c, initiative: clamp(rng(20) + c.initiativeBonus, -20, 60) } : c,
    ),
  });
}

export function startCombat(enc: Encounter): Encounter {
  if (enc.combatants.length === 0) return enc;
  return { ...sortByInitiative({ ...enc, round: 0 }), round: 1, turn: 0 };
}

export function endCombat(enc: Encounter): Encounter {
  return { ...enc, round: 0, turn: 0 };
}

function tickConditions(c: Combatant): Combatant {
  return {
    ...c,
    conditions: c.conditions
      .map((condition) => (condition.rounds === null ? condition : { ...condition, rounds: condition.rounds - 1 }))
      .filter((condition) => condition.rounds === null || condition.rounds > 0),
  };
}

/** Advance to the next combatant; its timed conditions lose a round as its turn starts. */
export function nextTurn(enc: Encounter): Encounter {
  if (enc.combatants.length === 0) return enc;
  if (enc.round === 0) return startCombat(enc);
  const wrapped = enc.turn + 1 >= enc.combatants.length;
  const turn = wrapped ? 0 : enc.turn + 1;
  const round = enc.round + (wrapped ? 1 : 0);
  return mapOne({ ...enc, turn, round }, enc.combatants[turn].id, tickConditions);
}

/** Step back one turn. Conditions are not restored; this is for fixing a misclick. */
export function previousTurn(enc: Encounter): Encounter {
  if (enc.combatants.length === 0 || enc.round === 0 || (enc.round === 1 && enc.turn === 0)) return enc;
  if (enc.turn > 0) return { ...enc, turn: enc.turn - 1 };
  return { ...enc, turn: enc.combatants.length - 1, round: enc.round - 1 };
}

export function damage(enc: Encounter, id: string, amount: number): Encounter {
  const value = clamp(amount, 0, 100_000);
  return mapOne(enc, id, (c) => {
    const absorbed = Math.min(c.tempHp, value);
    return { ...c, tempHp: c.tempHp - absorbed, hp: Math.max(0, c.hp - (value - absorbed)) };
  });
}

export function heal(enc: Encounter, id: string, amount: number): Encounter {
  const value = clamp(amount, 0, 100_000);
  return mapOne(enc, id, (c) => ({ ...c, hp: Math.min(c.maxHp, c.hp + value) }));
}

/** Temporary hit points do not stack: the higher value wins. */
export function setTempHp(enc: Encounter, id: string, amount: number): Encounter {
  return mapOne(enc, id, (c) => ({ ...c, tempHp: Math.max(c.tempHp, clamp(amount, 0, 10_000)) }));
}

export function toggleCondition(enc: Encounter, id: string, name: string, rounds: number | null): Encounter {
  return mapOne(enc, id, (c) => {
    if (c.conditions.some((condition) => condition.name === name)) {
      return { ...c, conditions: c.conditions.filter((condition) => condition.name !== name) };
    }
    if (c.conditions.length >= 12) return c;
    const clean = name.trim().slice(0, 40);
    if (!clean) return c;
    return { ...c, conditions: [...c.conditions, { name: clean, rounds: rounds === null ? null : clamp(rounds, 1, 1000) }] };
  });
}

export type CombatantPatch = Partial<Pick<Combatant, "name" | "ac" | "maxHp" | "hp" | "initiativeBonus" | "concentration" | "notes">>;

export function patchCombatant(enc: Encounter, id: string, patch: CombatantPatch): Encounter {
  return mapOne(enc, id, (c) => {
    const next = { ...c, ...patch };
    const maxHp = clamp(next.maxHp, 1, 10_000);
    return {
      ...next,
      name: next.name.trim().slice(0, 80) || c.name,
      notes: next.notes.slice(0, 2000),
      ac: clamp(next.ac, 0, 40),
      initiativeBonus: clamp(next.initiativeBonus, -20, 40),
      maxHp,
      hp: clamp(next.hp, 0, maxHp),
    };
  });
}

export function renameEncounter(enc: Encounter, name: string): Encounter {
  const clean = name.trim().slice(0, 80);
  return clean ? { ...enc, name: clean } : enc;
}

export type HealthState = "healthy" | "bloodied" | "down";

export function healthState(c: Pick<Combatant, "hp" | "maxHp">): HealthState {
  if (c.hp <= 0) return "down";
  return c.hp <= c.maxHp / 2 ? "bloodied" : "healthy";
}
