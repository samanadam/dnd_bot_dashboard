import { z } from "zod";
import { creatureRefSchema } from "@/lib/dm/encounter";
import { localId } from "./body";

// The live-play half of a sheet. Changed only by operations (ops.ts), applied
// on the server in one transaction each, so the DM's damage and the player's
// healing at the same moment both land.

// The same shape a combatant's condition has, so combat can hand them over as is.
export const conditionSchema = z.object({ name: z.string().trim().min(1).max(40), rounds: z.number().int().min(1).max(1000).nullable() }).strict();
export type Condition = z.infer<typeof conditionSchema>;

const count = z.number().int().min(0).max(10_000);

export const vitalsSchema = z
  .object({
    hp: count,
    tempHp: count,
    maxHpAdjust: z.number().int().min(-2000).max(2000),
    deathSaves: z.object({ successes: z.number().int().min(0).max(3), failures: z.number().int().min(0).max(3) }).strict(),
    stable: z.boolean(),
    hitDiceSpent: z.object({ 6: count, 8: count, 10: count, 12: count }).strict(),
    slotsSpent: z.array(z.number().int().min(0).max(20)).length(9),
    pactSpent: z.number().int().min(0).max(10),
    resourcesUsed: z.record(localId, z.number().int().min(0).max(999)),
    conditions: z.array(conditionSchema).max(12),
    concentration: z.object({ spellRef: creatureRefSchema.nullable(), name: z.string().trim().min(1).max(120) }).strict().nullable(),
    exhaustion: z.number().int().min(0).max(6),
    inspiration: z.boolean(),
    companions: z.record(
      localId,
      z.object({ hp: count, tempHp: count, conditions: z.array(conditionSchema).max(12) }).strict(),
    ),
  })
  .strict();

export type Vitals = z.infer<typeof vitalsSchema>;

export function newVitals(maxHp: number): Vitals {
  return {
    hp: maxHp,
    tempHp: 0,
    maxHpAdjust: 0,
    deathSaves: { successes: 0, failures: 0 },
    stable: false,
    hitDiceSpent: { 6: 0, 8: 0, 10: 0, 12: 0 },
    slotsSpent: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    pactSpent: 0,
    resourcesUsed: {},
    conditions: [],
    concentration: null,
    exhaustion: 0,
    inspiration: false,
    companions: {},
  };
}
