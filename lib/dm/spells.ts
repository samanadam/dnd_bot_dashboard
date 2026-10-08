import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { campaignClause, campaignIdSchema, type ScopedSelection } from "@/lib/campaign/selection";
import { DiceError, parseDice } from "@/lib/dice/roll";
import { creatureRefSchema } from "./encounter";

// A spell is plain data. SRD spells are bundled (data/srd/spells-*.json,
// read-only); custom spells are the DM's own, or a player's homebrew, kept in
// the database per campaign. Sheets point at either with a SpellRef.

export const SCHOOLS = [
  "abjuration",
  "conjuration",
  "divination",
  "enchantment",
  "evocation",
  "illusion",
  "necromancy",
  "transmutation",
] as const;
export type School = (typeof SCHOOLS)[number];

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];

function isDice(value: string): boolean {
  try {
    parseDice(value);
    return true;
  } catch (error) {
    if (error instanceof DiceError) return false;
    throw error;
  }
}

/** A roll the portal's own dice roller can read, such as 2d8+3. */
export const diceSchema = z.string().trim().min(1).max(40).refine(isDice, "must be dice like 2d6+3");

const shortText = (max: number) => z.string().trim().max(max);

export const spellBlockSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    // 0 is a cantrip.
    level: z.number().int().min(0).max(9),
    school: z.enum(SCHOOLS),
    castingTime: shortText(200).min(1),
    ritual: z.boolean(),
    range: shortText(60).min(1),
    components: z
      .object({
        verbal: z.boolean(),
        somatic: z.boolean(),
        material: z.boolean(),
        materialText: shortText(500),
        materialCostGp: z.number().min(0).max(1_000_000).nullable(),
        materialConsumed: z.boolean(),
      })
      .strict(),
    duration: shortText(60).min(1),
    concentration: z.boolean(),
    classes: z.array(shortText(40).min(1)).max(16),
    attack: z.enum(["melee", "ranged"]).nullable(),
    save: z.enum(ABILITIES).nullable(),
    effect: z
      .object({
        kind: z.enum(["damage", "healing"]),
        roll: diceSchema,
        types: z.array(shortText(30).min(1)).max(6),
      })
      .strict()
      .nullable(),
    // How the effect grows: with the slot it is cast from, or with the caster's level (cantrips).
    scaling: z
      .object({
        by: z.enum(["slot", "character"]),
        steps: z.array(z.object({ at: z.number().int().min(1).max(20), roll: diceSchema }).strict()).min(1).max(20),
      })
      .strict()
      .nullable(),
    description: z.string().max(20_000),
    higherLevel: z.string().max(4_000),
  })
  .strict();

export type SpellBlock = z.infer<typeof spellBlockSchema>;

/** What a sheet stores to name a spell: an SRD spell or a custom one. */
export const spellRefSchema = creatureRefSchema;
export type SpellRef = z.infer<typeof spellRefSchema>;

export const customSpellSchema = spellBlockSchema
  .extend({
    // Left out on an update it is unchanged; null files the spell under no campaign.
    campaignId: campaignIdSchema.nullable().optional(),
  })
  .strict();

export type CustomSpellInput = z.infer<typeof customSpellSchema>;

/** What every stored custom block carries besides its own fields. */
export type BlockMeta = {
  id: string;
  campaignId: string | null;
  // null: the DM's own. Otherwise the player who wrote it as homebrew.
  authorUserId: string | null;
  // Homebrew starts private to its author and the DM; sharing shows it to the campaign.
  shared: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomSpell = SpellBlock & BlockMeta;

export const SPELL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MAX_CUSTOM_SPELLS = 1000;

/** "Evocation cantrip", "2nd-level evocation". */
export function spellLevelLine(spell: Pick<SpellBlock, "level" | "school">): string {
  const school = spell.school[0].toUpperCase() + spell.school.slice(1);
  if (spell.level === 0) return `${school} cantrip`;
  const suffix = spell.level === 1 ? "st" : spell.level === 2 ? "nd" : spell.level === 3 ? "rd" : "th";
  return `${spell.level}${suffix}-level ${spell.school}`;
}

type Row = {
  id: string;
  name: string;
  campaign_id: string | null;
  author_user_id: string | null;
  shared: number;
  data: string;
  created_at: string;
  updated_at: string;
};

export type Author = { userId: string; shared: boolean };

/**
 * Rows of one table holding named blocks (spells, feats): one implementation,
 * two schemas. The block is stored without its name, validated on the way in
 * and again on the way out, so a damaged row never reaches a page.
 */
export class BlockRepo<Block extends { name: string }> {
  constructor(
    private readonly db: DatabaseSync,
    private readonly table: "spells" | "feats",
    private readonly inputSchema: z.ZodType<Block & { campaignId?: string | null }>,
    private readonly storedSchema: z.ZodType<Omit<Block, "name">>,
    private readonly limit: number,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  private toBlock(row: Row | undefined): (Block & BlockMeta) | null {
    if (!row) return null;
    try {
      const data = this.storedSchema.safeParse(JSON.parse(row.data));
      if (!data.success) return null;
      const meta: BlockMeta = {
        id: row.id,
        campaignId: row.campaign_id,
        authorUserId: row.author_user_id,
        shared: row.shared === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      return { ...data.data, name: row.name, ...meta } as Block & BlockMeta;
    } catch {
      return null;
    }
  }

  list(campaign: ScopedSelection = null): (Block & BlockMeta)[] {
    const scope = campaignClause(campaign);
    const rows = this.db
      .prepare(`SELECT * FROM ${this.table}${scope.sql ? ` WHERE ${scope.sql}` : ""} ORDER BY name COLLATE NOCASE, id`)
      .all(...scope.args) as Row[];
    return rows.map((row) => this.toBlock(row)).filter((block): block is Block & BlockMeta => block !== null);
  }

  count(): number {
    return Number((this.db.prepare(`SELECT COUNT(*) AS n FROM ${this.table}`).get() as { n: number }).n);
  }

  get(id: string): (Block & BlockMeta) | null {
    if (!SPELL_ID.test(id)) return null;
    return this.toBlock(this.db.prepare(`SELECT * FROM ${this.table} WHERE id = ?`).get(id) as Row | undefined);
  }

  /** Returns null when the limit is reached. Without an author the row is the DM's and shared. */
  create(input: Block & { campaignId?: string | null }, author?: Author): (Block & BlockMeta) | null {
    if (this.count() >= this.limit) return null;
    const { name, campaignId, ...data } = this.inputSchema.parse(input);
    const id = this.newId();
    const at = this.now().toISOString();
    this.db
      .prepare(
        `INSERT INTO ${this.table} (id, name, campaign_id, author_user_id, shared, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, name, campaignId ?? null, author?.userId ?? null, author && !author.shared ? 0 : 1, JSON.stringify(data), at, at);
    return this.get(id);
  }

  update(id: string, input: Block & { campaignId?: string | null }): (Block & BlockMeta) | null {
    if (!SPELL_ID.test(id)) return null;
    const { name, campaignId, ...data } = this.inputSchema.parse(input);
    const at = this.now().toISOString();
    const result =
      campaignId === undefined
        ? this.db.prepare(`UPDATE ${this.table} SET name = ?, data = ?, updated_at = ? WHERE id = ?`).run(name, JSON.stringify(data), at, id)
        : this.db
            .prepare(`UPDATE ${this.table} SET name = ?, campaign_id = ?, data = ?, updated_at = ? WHERE id = ?`)
            .run(name, campaignId, JSON.stringify(data), at, id);
    return Number(result.changes) > 0 ? this.get(id) : null;
  }

  setShared(id: string, shared: boolean): (Block & BlockMeta) | null {
    if (!SPELL_ID.test(id)) return null;
    const at = this.now().toISOString();
    const result = this.db.prepare(`UPDATE ${this.table} SET shared = ?, updated_at = ? WHERE id = ?`).run(shared ? 1 : 0, at, id);
    return Number(result.changes) > 0 ? this.get(id) : null;
  }

  remove(id: string): boolean {
    if (!SPELL_ID.test(id)) return false;
    return Number(this.db.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id).changes) > 0;
  }
}

export class SpellRepo extends BlockRepo<SpellBlock> {
  constructor(db: DatabaseSync, now?: () => Date, newId?: () => string) {
    super(db, "spells", customSpellSchema, spellBlockSchema.omit({ name: true }), MAX_CUSTOM_SPELLS, now, newId);
  }
}
