import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { campaignIdSchema } from "@/lib/campaign/selection";
import { creatureRefSchema } from "./encounter";
import { BlockRepo, type BlockMeta } from "./spells";

// A feat is plain data, bundled from the SRD or kept as the DM's own (or a
// player's homebrew) per campaign, exactly like spells.

export const featBlockSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    // "General", "Origin", "Fighting Style", "Epic Boon"; free text for custom feats.
    category: z.string().trim().max(40),
    // Empty when there is none.
    prerequisite: z.string().trim().max(200),
    repeatable: z.boolean(),
    description: z.string().max(20_000),
  })
  .strict();

export type FeatBlock = z.infer<typeof featBlockSchema>;

export const featRefSchema = creatureRefSchema;
export type FeatRef = z.infer<typeof featRefSchema>;

export const customFeatSchema = featBlockSchema
  .extend({ campaignId: campaignIdSchema.nullable().optional() })
  .strict();

export type CustomFeatInput = z.infer<typeof customFeatSchema>;
export type CustomFeat = FeatBlock & BlockMeta;

export const MAX_CUSTOM_FEATS = 500;

export class FeatRepo extends BlockRepo<FeatBlock> {
  constructor(db: DatabaseSync, now?: () => Date, newId?: () => string) {
    super(db, "feats", customFeatSchema, featBlockSchema.omit({ name: true }), MAX_CUSTOM_FEATS, now, newId);
  }
}
