import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { campaignClause, campaignIdSchema, type Selection } from "@/lib/campaign/selection";
import { statBlockSchema } from "./statblock";

export const creatureKindSchema = z.enum(["monster", "npc"]);
export type CreatureKind = z.infer<typeof creatureKindSchema>;

export const creatureInputSchema = z
  .object({
    kind: creatureKindSchema,
    statBlock: statBlockSchema,
    notes: z.string().max(20_000),
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
    // Which campaign an NPC belongs to. Left out on an update it is unchanged;
    // null files it under no campaign. Custom monsters ignore it (shared).
    campaignId: campaignIdSchema.nullable().optional(),
  })
  .strict();

export type CreatureInput = z.infer<typeof creatureInputSchema>;
export type Creature = Omit<CreatureInput, "campaignId"> & {
  id: string;
  campaignId: string | null;
  createdAt: string;
  updatedAt: string;
};

export const CREATURE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Row = { id: string; kind: string; data: string; campaign_id: string | null; created_at: string; updated_at: string };

const storedSchema = creatureInputSchema.omit({ kind: true, campaignId: true });

export class CreatureRepo {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  // Rows are validated again on the way out, so a corrupted or hand-edited row
  // can never reach a page in an unexpected shape.
  private toCreature(row: Row | undefined): Creature | null {
    if (!row) return null;
    let json: unknown;
    try {
      json = JSON.parse(row.data);
    } catch {
      return null;
    }
    const data = storedSchema.safeParse(json);
    const kind = creatureKindSchema.safeParse(row.kind);
    if (!data.success || !kind.success) return null;
    return {
      id: row.id,
      kind: kind.data,
      ...data.data,
      campaignId: row.campaign_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  list(kind?: CreatureKind, campaign: Selection = null): Creature[] {
    const where: string[] = [];
    const args: string[] = [];
    if (kind) {
      where.push("kind = ?");
      args.push(kind);
    }
    const scope = campaignClause(campaign);
    if (scope.sql) {
      where.push(scope.sql);
      args.push(...scope.args);
    }
    const rows = this.db
      .prepare(`SELECT * FROM creatures${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at, id`)
      .all(...args) as Row[];
    return rows.map((row) => this.toCreature(row)).filter((creature): creature is Creature => creature !== null);
  }

  get(id: string): Creature | null {
    if (!CREATURE_ID.test(id)) return null;
    return this.toCreature(this.db.prepare("SELECT * FROM creatures WHERE id = ?").get(id) as Row | undefined);
  }

  create(input: CreatureInput): Creature {
    const value = creatureInputSchema.parse(input);
    const id = this.newId();
    const at = this.now().toISOString();
    const { kind, campaignId, ...data } = value;
    this.db
      .prepare("INSERT INTO creatures (id, kind, name, data, campaign_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, kind, value.statBlock.name, JSON.stringify(data), campaignId ?? null, at, at);
    return { id, ...data, kind, campaignId: campaignId ?? null, createdAt: at, updatedAt: at };
  }

  update(id: string, input: CreatureInput): Creature | null {
    if (!CREATURE_ID.test(id)) return null;
    const value = creatureInputSchema.parse(input);
    const { kind, campaignId, ...data } = value;
    const at = this.now().toISOString();
    const result =
      campaignId === undefined
        ? this.db
            .prepare("UPDATE creatures SET kind = ?, name = ?, data = ?, updated_at = ? WHERE id = ?")
            .run(kind, value.statBlock.name, JSON.stringify(data), at, id)
        : this.db
            .prepare("UPDATE creatures SET kind = ?, name = ?, data = ?, campaign_id = ?, updated_at = ? WHERE id = ?")
            .run(kind, value.statBlock.name, JSON.stringify(data), campaignId, at, id);
    return Number(result.changes) > 0 ? this.get(id) : null;
  }

  remove(id: string): boolean {
    if (!CREATURE_ID.test(id)) return false;
    return Number(this.db.prepare("DELETE FROM creatures WHERE id = ?").run(id).changes) > 0;
  }
}
