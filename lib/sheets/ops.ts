import { z } from "zod";
import type { Rng } from "@/lib/dice/random";
import { rollDice } from "@/lib/dice/roll";
import { creatureRefSchema, type CreatureRef } from "@/lib/dm/encounter";
import { localId, type SheetBody } from "./body";
import { derive } from "./derive";
import type { Edition } from "./rules";
import { conditionSchema, type Vitals } from "./vitals";

// Every change to a sheet's live-play state is one of these operations. The
// server applies them in a transaction (repo.ts); the page applies the same
// function first so the screen answers at once.

const amount = z.number().int().min(0).max(10_000);
const slotLevel = z.number().int().min(1).max(9);
const die = z.union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)]);

const companionOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("damage"), amount }).strict(),
  z.object({ op: z.literal("heal"), amount }).strict(),
  z.object({ op: z.literal("setTemp"), tempHp: amount }).strict(),
  z.object({ op: z.literal("addCondition"), name: conditionSchema.shape.name, rounds: conditionSchema.shape.rounds }).strict(),
  z.object({ op: z.literal("removeCondition"), name: conditionSchema.shape.name }).strict(),
]);

export const opSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("damage"), amount, crit: z.boolean().optional() }).strict(),
  z.object({ op: z.literal("heal"), amount }).strict(),
  z.object({ op: z.literal("setHp"), hp: amount }).strict(),
  z.object({ op: z.literal("setTemp"), tempHp: amount, mode: z.enum(["max", "replace"]) }).strict(),
  z.object({ op: z.literal("deathSave"), result: z.enum(["success", "failure", "crit", "fumble"]) }).strict(),
  z.object({ op: z.literal("stabilize") }).strict(),
  z.object({ op: z.literal("resetDeathSaves") }).strict(),
  z.object({ op: z.literal("spendSlot"), level: slotLevel }).strict(),
  z.object({ op: z.literal("restoreSlot"), level: slotLevel }).strict(),
  z.object({ op: z.literal("spendPact") }).strict(),
  z.object({ op: z.literal("restorePact") }).strict(),
  z.object({ op: z.literal("useResource"), id: localId, amount: z.number().int().min(1).max(99) }).strict(),
  z.object({ op: z.literal("restoreResource"), id: localId, amount: z.number().int().min(1).max(99) }).strict(),
  z.object({ op: z.literal("spendHitDie"), die, roll: z.boolean() }).strict(),
  z.object({ op: z.literal("addCondition"), name: conditionSchema.shape.name, rounds: conditionSchema.shape.rounds }).strict(),
  z.object({ op: z.literal("removeCondition"), name: conditionSchema.shape.name }).strict(),
  z.object({ op: z.literal("tickConditions") }).strict(),
  z.object({ op: z.literal("concentrate"), spellRef: creatureRefSchema.nullable(), name: z.string().trim().min(1).max(120) }).strict(),
  z.object({ op: z.literal("dropConcentration") }).strict(),
  z.object({ op: z.literal("exhaustion"), delta: z.number().int().min(-6).max(6) }).strict(),
  z.object({ op: z.literal("inspiration"), value: z.boolean() }).strict(),
  z
    .object({
      op: z.literal("cast"),
      spellRef: creatureRefSchema,
      slot: z.union([slotLevel, z.literal("pact"), z.literal("ritual"), z.literal("free")]),
    })
    .strict(),
  z.object({ op: z.literal("shortRest"), hitDice: z.object({ 6: amount, 8: amount, 10: amount, 12: amount }).partial().strict() }).strict(),
  z.object({ op: z.literal("longRest") }).strict(),
  z.object({ op: z.literal("companion"), id: localId, change: companionOp }).strict(),
]);

export type Op = z.infer<typeof opSchema>;
export const opBatchSchema = z.object({ ops: z.array(opSchema).min(1).max(20) }).strict();

export type RollRecord = { label: string; expression: string; total: number; breakdown: string };
export type OpResult = {
  rolls: RollRecord[];
  replacedConcentration: string | null;
  // A concentration save the damage calls for: DC 10 or half the damage, whichever is higher.
  concentrationDc: number | null;
  instantDeath: boolean;
};

/** What a cast needs to know about the spell: from the bundled SRD, a custom row, or nothing (missing). */
export type SpellFacts = { name: string; level: number; concentration: boolean; ritual: boolean };
export type OpContext = {
  body: SheetBody;
  edition: Edition;
  rng: Rng;
  spell: (ref: CreatureRef) => SpellFacts | null;
};

export type Applied = { ok: true; vitals: Vitals; result: OpResult } | { ok: false; reason: string };

const refuse = (reason: string): Applied => ({ ok: false, reason });
const sameRef = (a: CreatureRef, b: CreatureRef) =>
  a.source === b.source && (a.source === "custom" ? a.id === (b as typeof a).id : a.edition === (b as typeof a).edition && a.slug === (b as typeof a).slug);

function emptyResult(): OpResult {
  return { rolls: [], replacedConcentration: null, concentrationDc: null, instantDeath: false };
}

function withCondition(list: Vitals["conditions"], name: string, rounds: number | null) {
  const rest = list.filter((c) => c.name.toLocaleLowerCase("en") !== name.toLocaleLowerCase("en"));
  return [...rest, { name, rounds }].slice(-12);
}

/** Applies one operation to a copy of the vitals. Pure but for the dice `rng`. */
export function applyOp(current: Vitals, op: Op, context: OpContext): Applied {
  const v: Vitals = structuredClone(current);
  const result = emptyResult();
  const derived = derive(context.body, v, context.edition);
  const maxHp = derived.maxHp;

  switch (op.op) {
    case "damage": {
      if (op.amount === 0) break;
      if (v.concentration) result.concentrationDc = Math.min(30, Math.max(10, Math.floor(op.amount / 2)));
      if (v.hp === 0) {
        // Already down: a hit is a failed death save (two on a crit); a hit as big as the maximum kills.
        if (op.amount >= maxHp) {
          v.deathSaves.failures = 3;
          result.instantDeath = true;
        } else v.deathSaves.failures = Math.min(3, v.deathSaves.failures + (op.crit ? 2 : 1));
        v.stable = false;
        break;
      }
      const absorbed = Math.min(v.tempHp, op.amount);
      v.tempHp -= absorbed;
      const rest = op.amount - absorbed;
      if (rest >= v.hp) {
        const overflow = rest - v.hp;
        v.hp = 0;
        v.stable = false;
        v.deathSaves = { successes: 0, failures: 0 };
        if (overflow >= maxHp) {
          v.deathSaves.failures = 3;
          result.instantDeath = true;
        }
        if (v.concentration) result.replacedConcentration = v.concentration.name;
        v.concentration = null;
        result.concentrationDc = null;
      } else v.hp -= rest;
      break;
    }
    case "heal": {
      if (op.amount === 0) break;
      if (v.deathSaves.failures >= 3) return refuse("A dead character cannot be healed; use Set HP to bring them back.");
      const wasDown = v.hp === 0;
      v.hp = Math.min(maxHp, v.hp + op.amount);
      if (wasDown) {
        v.deathSaves = { successes: 0, failures: 0 };
        v.stable = false;
      }
      break;
    }
    case "setHp":
      v.hp = Math.min(maxHp, op.hp);
      if (v.hp > 0) {
        v.deathSaves = { successes: 0, failures: 0 };
        v.stable = false;
      }
      break;
    case "setTemp":
      // Temporary hit points never stack: keep the higher unless told to replace.
      v.tempHp = op.mode === "max" ? Math.max(v.tempHp, op.tempHp) : op.tempHp;
      break;
    case "deathSave": {
      if (v.hp > 0) return refuse("Death saves are only for a character at 0 hit points.");
      if (op.result === "crit") {
        v.hp = 1;
        v.deathSaves = { successes: 0, failures: 0 };
        v.stable = false;
      } else if (op.result === "fumble") v.deathSaves.failures = Math.min(3, v.deathSaves.failures + 2);
      else if (op.result === "failure") v.deathSaves.failures = Math.min(3, v.deathSaves.failures + 1);
      else {
        v.deathSaves.successes = Math.min(3, v.deathSaves.successes + 1);
        if (v.deathSaves.successes === 3) v.stable = true;
      }
      break;
    }
    case "stabilize":
      if (v.hp > 0) return refuse("Only a character at 0 hit points can be stabilised.");
      v.stable = true;
      v.deathSaves = { successes: 0, failures: 0 };
      break;
    case "resetDeathSaves":
      v.deathSaves = { successes: 0, failures: 0 };
      v.stable = false;
      break;
    case "spendSlot":
      if (derived.slotsLeft[op.level - 1] < 1) return refuse(`No level ${op.level} slot left.`);
      v.slotsSpent[op.level - 1] += 1;
      break;
    case "restoreSlot":
      if (v.slotsSpent[op.level - 1] < 1) return refuse(`No level ${op.level} slot is spent.`);
      v.slotsSpent[op.level - 1] -= 1;
      break;
    case "spendPact":
      if (derived.pact.left < 1) return refuse("No Pact Magic slot left.");
      v.pactSpent += 1;
      break;
    case "restorePact":
      if (v.pactSpent < 1) return refuse("No Pact Magic slot is spent.");
      v.pactSpent -= 1;
      break;
    case "useResource": {
      const resource = derived.resources.find((r) => r.id === op.id);
      if (!resource) return refuse("No such resource on this sheet.");
      if (resource.left < op.amount) return refuse(`Not enough ${resource.name} left.`);
      v.resourcesUsed[op.id] = resource.used + op.amount;
      break;
    }
    case "restoreResource": {
      const resource = derived.resources.find((r) => r.id === op.id);
      if (!resource) return refuse("No such resource on this sheet.");
      v.resourcesUsed[op.id] = Math.max(0, resource.used - op.amount);
      break;
    }
    case "spendHitDie": {
      const pool = derived.hitDice.find((h) => h.die === op.die);
      if (!pool || pool.left < 1) return refuse(`No d${op.die} hit die left.`);
      v.hitDiceSpent[op.die] += 1;
      if (op.roll) {
        const con = derived.abilities.con.mod;
        const roll = rollDice(`1d${op.die}`, context.rng);
        const healed = Math.max(0, roll.total + con);
        result.rolls.push({ label: `Hit die d${op.die}`, expression: `1d${op.die}${con >= 0 ? `+${con}` : con}`, total: healed, breakdown: `${roll.breakdown} ${con >= 0 ? "+" : "-"} ${Math.abs(con)}` });
        if (v.deathSaves.failures < 3) v.hp = Math.min(maxHp, v.hp + healed);
      }
      break;
    }
    case "addCondition":
      v.conditions = withCondition(v.conditions, op.name, op.rounds);
      break;
    case "removeCondition":
      v.conditions = v.conditions.filter((c) => c.name.toLocaleLowerCase("en") !== op.name.toLocaleLowerCase("en"));
      break;
    case "tickConditions":
      v.conditions = v.conditions
        .map((c) => (c.rounds === null ? c : { ...c, rounds: c.rounds - 1 }))
        .filter((c) => c.rounds === null || c.rounds > 0);
      break;
    case "concentrate":
      if (v.concentration) result.replacedConcentration = v.concentration.name;
      v.concentration = { spellRef: op.spellRef, name: op.name };
      break;
    case "dropConcentration":
      v.concentration = null;
      break;
    case "exhaustion":
      v.exhaustion = Math.max(0, Math.min(6, v.exhaustion + op.delta));
      break;
    case "inspiration":
      v.inspiration = op.value;
      break;
    case "cast": {
      if (!context.body.spellcasting.entries.some((entry) => sameRef(entry.ref, op.spellRef))) return refuse("That spell is not on this sheet.");
      const spell = context.spell(op.spellRef);
      if (!spell) return refuse("That spell no longer exists.");
      if (op.slot === "ritual") {
        if (!spell.ritual) return refuse(`${spell.name} is not a ritual.`);
      } else if (op.slot === "pact") {
        if (spell.level === 0) return refuse("Cantrips need no slot.");
        if (derived.pact.left < 1) return refuse("No Pact Magic slot left.");
        if (derived.pact.level < spell.level) return refuse(`Your Pact Magic slots are level ${derived.pact.level}, below ${spell.name}.`);
        v.pactSpent += 1;
      } else if (op.slot !== "free") {
        if (spell.level === 0) return refuse("Cantrips need no slot.");
        if (op.slot < spell.level) return refuse(`${spell.name} needs a slot of level ${spell.level} or higher.`);
        if (derived.slotsLeft[op.slot - 1] < 1) return refuse(`No level ${op.slot} slot left.`);
        v.slotsSpent[op.slot - 1] += 1;
      }
      if (spell.concentration) {
        if (v.concentration) result.replacedConcentration = v.concentration.name;
        v.concentration = { spellRef: op.spellRef, name: spell.name };
      }
      break;
    }
    case "shortRest": {
      v.pactSpent = 0;
      for (const resource of context.body.resources) if (resource.reset === "short") v.resourcesUsed[resource.id] = restored(resource, v.resourcesUsed[resource.id] ?? 0);
      for (const [size, wanted] of Object.entries(op.hitDice)) {
        const d = Number(size) as 6 | 8 | 10 | 12;
        for (let i = 0; i < (wanted ?? 0); i++) {
          const pool = derive(context.body, v, context.edition).hitDice.find((h) => h.die === d);
          if (!pool || pool.left < 1) break;
          const next = applyOp(v, { op: "spendHitDie", die: d, roll: true }, context);
          if (!next.ok) break;
          Object.assign(v, next.vitals);
          result.rolls.push(...next.result.rolls);
        }
      }
      break;
    }
    case "longRest": {
      if (v.deathSaves.failures >= 3) return refuse("A dead character does not rest.");
      v.hp = maxHp;
      v.tempHp = 0;
      v.slotsSpent = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      v.pactSpent = 0;
      v.deathSaves = { successes: 0, failures: 0 };
      v.stable = false;
      for (const resource of context.body.resources) if (resource.reset !== "none") v.resourcesUsed[resource.id] = restored(resource, v.resourcesUsed[resource.id] ?? 0);
      for (const pool of derived.hitDice) {
        // 2014: back half your hit dice (at least one). 2024: all of them.
        const back = context.edition === "2024" ? pool.total : Math.max(1, Math.floor(pool.total / 2));
        v.hitDiceSpent[pool.die] = Math.max(0, v.hitDiceSpent[pool.die] - back);
      }
      v.exhaustion = Math.max(0, v.exhaustion - 1);
      // Exhaustion shrinks max HP in 2014; heal to the new maximum.
      v.hp = derive(context.body, v, context.edition).maxHp;
      break;
    }
    case "companion": {
      const companion = context.body.companions.find((c) => c.id === op.id);
      if (!companion) return refuse("No such companion on this sheet.");
      const state = v.companions[op.id] ?? { hp: companion.maxHp, tempHp: 0, conditions: [] };
      const change = op.change;
      if (change.op === "damage") {
        const absorbed = Math.min(state.tempHp, change.amount);
        state.tempHp -= absorbed;
        state.hp = Math.max(0, state.hp - (change.amount - absorbed));
      } else if (change.op === "heal") state.hp = Math.min(companion.maxHp, state.hp + change.amount);
      else if (change.op === "setTemp") state.tempHp = Math.max(state.tempHp, change.tempHp);
      else if (change.op === "addCondition") state.conditions = withCondition(state.conditions, change.name, change.rounds);
      else state.conditions = state.conditions.filter((c) => c.name.toLocaleLowerCase("en") !== change.name.toLocaleLowerCase("en"));
      v.companions[op.id] = state;
      break;
    }
  }
  return { ok: true, vitals: v, result };
}

function restored(resource: SheetBody["resources"][number], used: number): number {
  return resource.resetAmount === "all" ? 0 : Math.max(0, used - resource.resetAmount);
}

/** Applies a batch: all of them, or none when one is refused. */
export function applyOps(current: Vitals, ops: readonly Op[], context: OpContext): { ok: true; vitals: Vitals; results: OpResult[] } | { ok: false; reason: string; index: number } {
  let vitals = current;
  const results: OpResult[] = [];
  for (const [index, op] of ops.entries()) {
    const applied = applyOp(vitals, op, context);
    if (!applied.ok) return { ok: false, reason: applied.reason, index };
    vitals = applied.vitals;
    results.push(applied.result);
  }
  return { ok: true, vitals, results };
}
