import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { campaignClause, campaignIdSchema, type ScopedSelection } from "@/lib/campaign/selection";
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
  // Set only for monsters imported from a book (see libraryImport.ts).
  source: string | null;
  sourceKey: string | null;
  supersedes: string | null;
  createdAt: string;
  updatedAt: string;
};

export const CREATURE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Row = {
  id: string;
  kind: string;
  data: string;
  campaign_id: string | null;
  source: string | null;
  source_key: string | null;
  supersedes: string | null;
  created_at: string;
  updated_at: string;
};

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
      source: row.source,
      sourceKey: row.source_key,
      supersedes: row.supersedes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  list(kind?: CreatureKind, campaign: ScopedSelection = null): Creature[] {
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
    return { id, ...data, kind, campaignId: campaignId ?? null, source: null, sourceKey: null, supersedes: null, createdAt: at, updatedAt: at };
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

  /** Inserts or refreshes one monster imported from a book, keyed by (source, sourceKey). */
  upsertImported(input: CreatureInput, origin: { source: string; sourceKey: string; supersedes: string | null }): "created" | "updated" {
    const value = creatureInputSchema.parse(input);
    const { kind, campaignId, ...data } = value;
    const at = this.now().toISOString();
    const updated = this.db
      .prepare("UPDATE creatures SET name = ?, data = ?, supersedes = ?, updated_at = ? WHERE source = ? AND source_key = ?")
      .run(value.statBlock.name, JSON.stringify(data), origin.supersedes, at, origin.source, origin.sourceKey);
    if (Number(updated.changes) > 0) return "updated";
    this.db
      .prepare("INSERT INTO creatures (id, kind, name, data, campaign_id, source, source_key, supersedes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(this.newId(), kind, value.statBlock.name, JSON.stringify(data), campaignId ?? null, origin.source, origin.sourceKey, origin.supersedes, at, at);
    return "created";
  }

  hasImported(source: string, sourceKey: string): boolean {
    return this.db.prepare("SELECT 1 FROM creatures WHERE source = ? AND source_key = ?").get(source, sourceKey) !== undefined;
  }

  listSources(): Array<{ source: string; count: number }> {
    const rows = this.db.prepare("SELECT source, COUNT(*) AS n FROM creatures WHERE source IS NOT NULL GROUP BY source ORDER BY source").all() as Array<{ source: string; n: number }>;
    return rows.map((row) => ({ source: row.source, count: Number(row.n) }));
  }

  /** Deletes every monster imported from one book; returns how many. */
  removeSource(source: string): number {
    return Number(this.db.prepare("DELETE FROM creatures WHERE source = ?").run(source).changes);
  }

  /** The bundled SRD entries (edition/slug) that an imported monster replaces. */
  supersededSrd(): Set<string> {
    const rows = this.db.prepare("SELECT DISTINCT supersedes FROM creatures WHERE supersedes IS NOT NULL").all() as Array<{ supersedes: string }>;
    return new Set(rows.map((row) => row.supersedes));
  }
}
