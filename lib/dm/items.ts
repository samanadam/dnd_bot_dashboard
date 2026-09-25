import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { campaignClause, campaignIdSchema, type Selection } from "@/lib/campaign/selection";
import { creatureRefSchema } from "./encounter";

// An item is plain data. SRD items are bundled (data/srd/items-*.json, read-only);
// custom items are the DM's own, kept in the database per campaign. A reward
// points at either with an ItemRef.

export const itemBlockSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    // Free text: "Weapon", "Potion", "Wondrous Item"...
    category: z.string().trim().max(60),
    // Empty for ordinary gear.
    rarity: z.string().trim().max(30),
    // Empty when no attunement; otherwise "Required" or the condition.
    attunement: z.string().trim().max(200),
    costGp: z.number().min(0).max(100_000_000),
    weightLb: z.number().min(0).max(100_000),
    // One line of mechanics: damage, armor class...
    detail: z.string().trim().max(300),
    description: z.string().max(20_000),
  })
  .strict();

export type ItemBlock = z.infer<typeof itemBlockSchema>;

/** What a reward stores to name an item: an SRD item or one of the DM's own. */
export const itemRefSchema = creatureRefSchema;
export type ItemRef = z.infer<typeof itemRefSchema>;

export const customItemSchema = itemBlockSchema
  .extend({
    // Left out on an update it is unchanged; null files the item under no campaign.
    campaignId: campaignIdSchema.nullable().optional(),
  })
  .strict();

export type CustomItemInput = z.infer<typeof customItemSchema>;
export type CustomItem = ItemBlock & { id: string; campaignId: string | null; createdAt: string; updatedAt: string };

export const ITEM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MAX_CUSTOM_ITEMS = 500;

/** A stable text key for a ref, used to find every reward that names an item. */
export function refKey(ref: ItemRef): string {
  return ref.source === "srd" ? `srd:${ref.edition}/${ref.slug}` : `custom:${ref.id}`;
}

type Row = { id: string; name: string; campaign_id: string | null; data: string; created_at: string; updated_at: string };

const storedSchema = itemBlockSchema.omit({ name: true });

export class ItemRepo {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  // Validated again on the way out, so a damaged row never reaches a page.
  private toItem(row: Row | undefined): CustomItem | null {
    if (!row) return null;
    try {
      const data = storedSchema.safeParse(JSON.parse(row.data));
      if (!data.success) return null;
      return { id: row.id, name: row.name, ...data.data, campaignId: row.campaign_id, createdAt: row.created_at, updatedAt: row.updated_at };
    } catch {
      return null;
    }
  }

  list(campaign: Selection = null): CustomItem[] {
    const scope = campaignClause(campaign);
    const rows = this.db
      .prepare(`SELECT * FROM items${scope.sql ? ` WHERE ${scope.sql}` : ""} ORDER BY name COLLATE NOCASE, id`)
      .all(...scope.args) as Row[];
    return rows.map((row) => this.toItem(row)).filter((item): item is CustomItem => item !== null);
  }

  count(): number {
    return Number((this.db.prepare("SELECT COUNT(*) AS n FROM items").get() as { n: number }).n);
  }

  get(id: string): CustomItem | null {
    if (!ITEM_ID.test(id)) return null;
    return this.toItem(this.db.prepare("SELECT * FROM items WHERE id = ?").get(id) as Row | undefined);
  }

  /** Returns null when the item limit is reached. */
  create(input: CustomItemInput): CustomItem | null {
    if (this.count() >= MAX_CUSTOM_ITEMS) return null;
    const value = customItemSchema.parse(input);
    const id = this.newId();
    const at = this.now().toISOString();
    const { name, campaignId, ...data } = value;
    this.db
      .prepare("INSERT INTO items (id, name, campaign_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, name, campaignId ?? null, JSON.stringify(data), at, at);
    return { id, name, ...data, campaignId: campaignId ?? null, createdAt: at, updatedAt: at };
  }

  update(id: string, input: CustomItemInput): CustomItem | null {
    if (!ITEM_ID.test(id)) return null;
    const value = customItemSchema.parse(input);
    const { name, campaignId, ...data } = value;
    const at = this.now().toISOString();
    const result =
      campaignId === undefined
        ? this.db.prepare("UPDATE items SET name = ?, data = ?, updated_at = ? WHERE id = ?").run(name, JSON.stringify(data), at, id)
        : this.db
            .prepare("UPDATE items SET name = ?, campaign_id = ?, data = ?, updated_at = ? WHERE id = ?")
            .run(name, campaignId, JSON.stringify(data), at, id);
    return Number(result.changes) > 0 ? this.get(id) : null;
  }

  remove(id: string): boolean {
    if (!ITEM_ID.test(id)) return false;
    return Number(this.db.prepare("DELETE FROM items WHERE id = ?").run(id).changes) > 0;
  }
}
