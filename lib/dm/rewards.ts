import { z } from "zod";
import { creatureRefSchema } from "./encounter";
import { itemRefSchema } from "./items";

// A reward is either an item the party can get or a "pointer": a social outcome
// that follows from something the party does ("if you save the mayor, the village
// helps in act 3"). Both are free-form planning notes with a status the DM
// changes at the table; nothing here moves items between characters.

export const ITEM_STATUSES = ["planned", "given", "skipped"] as const;
export const POINTER_STATUSES = ["pending", "earned", "lost"] as const;
export const itemStatusSchema = z.enum(ITEM_STATUSES);
export const pointerStatusSchema = z.enum(POINTER_STATUSES);

/** A status that counts as done: the item went out, the pointer was earned. */
export const DONE_STATUSES: readonly string[] = ["given", "earned"];

export const REWARD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const rewardId = z.string().regex(REWARD_ID);
// The linked battle the reward comes from; null means the area as a whole.
const battleId = z.string().regex(REWARD_ID).nullable();

const itemRewardSchema = z
  .object({
    kind: z.literal("item"),
    // Sent back on an edit so the reward keeps its identity; new rewards leave it out.
    id: rewardId.optional(),
    encounterId: battleId,
    status: itemStatusSchema,
    itemRef: itemRefSchema,
    quantity: z.number().int().min(1).max(9999),
    note: z.string().trim().max(500),
  })
  .strict();

const pointerRewardSchema = z
  .object({
    kind: z.literal("pointer"),
    id: rewardId.optional(),
    encounterId: battleId,
    status: pointerStatusSchema,
    title: z.string().trim().min(1).max(120),
    // What the party has to do: "Save the mayor from the goblins".
    condition: z.string().trim().max(500),
    // What they get: "The village shelters the party in act 3".
    outcome: z.string().trim().max(2000),
    npcRef: creatureRefSchema.nullable(),
  })
  .strict();

export const rewardInputSchema = z.discriminatedUnion("kind", [itemRewardSchema, pointerRewardSchema]);
export type RewardInput = z.infer<typeof rewardInputSchema>;
export type Reward = RewardInput & { id: string };

export const MAX_REWARDS = 100;
export const rewardListSchema = z
  .object({ version: z.number().int().min(1), rewards: z.array(rewardInputSchema).max(MAX_REWARDS) })
  .strict();

export const rewardStatusSchema = z.enum([...ITEM_STATUSES, ...POINTER_STATUSES]);
export const rewardStatusBodySchema = z.object({ status: rewardStatusSchema }).strict();

/** The part of a reward that is stored as JSON; the rest has its own columns. */
export function rewardData(reward: RewardInput): Record<string, unknown> {
  if (reward.kind === "item") return { itemRef: reward.itemRef, quantity: reward.quantity, note: reward.note };
  return { title: reward.title, condition: reward.condition, outcome: reward.outcome, npcRef: reward.npcRef };
}
