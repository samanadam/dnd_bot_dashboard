import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { campaignClause, campaignIdSchema, type Selection } from "@/lib/campaign/selection";
import { refKey } from "./items";
import { DONE_STATUSES, REWARD_ID, rewardData, rewardInputSchema, rewardStatusSchema, type Reward, type RewardInput } from "./rewards";

// An area is a place in the campaign (a cave, a village, a dungeon room) that
// groups battles and rewards. Battles are links to prepared encounters; rewards
// are rows of their own. The area's version guards against two tabs overwriting
// each other; ticking a reward's status does not touch it.

export const areaSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    summary: z.string().trim().max(2000),
    notes: z.string().max(20_000),
    // Left out on an update it is unchanged; null files the area under no campaign.
    campaignId: campaignIdSchema.nullable().optional(),
  })
  .strict();

export const areaUpdateSchema = areaSchema.extend({ version: z.number().int().min(1) }).strict();

export const AREA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MAX_AREAS = 200;
export const MAX_BATTLES = 40;

export const areaEncountersSchema = z
  .object({ version: z.number().int().min(1), encounterIds: z.array(z.string().regex(REWARD_ID)).max(MAX_BATTLES) })
  .strict();
export const areaOrderSchema = z.object({ ids: z.array(z.string().regex(AREA_ID)).max(MAX_AREAS) }).strict();

export type AreaInput = z.infer<typeof areaSchema>;
export type Area = {
  id: string;
  name: string;
  summary: string;
  notes: string;
  campaignId: string | null;
  position: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type AreaSummary = Pick<Area, "id" | "name" | "summary" | "campaignId" | "position" | "updatedAt"> & {
  battles: number;
  rewardsTotal: number;
  rewardsDone: number;
};

type AreaRow = {
  id: string;
  campaign_id: string | null;
  name: string;
  summary: string;
  notes: string;
  position: number;
  version: number;
  created_at: string;
  updated_at: string;
};
type RewardRow = { id: string; encounter_id: string | null; kind: string; status: string; data: string };

const toArea = (row: AreaRow): Area => ({
  id: row.id,
  name: row.name,
  summary: row.summary,
  notes: row.notes,
  campaignId: row.campaign_id,
  position: Number(row.position),
  version: Number(row.version),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** The area was changed since the version the caller read. */
export type Conflict = "conflict";
/** A reward names a battle that is not linked to the area. */
export type BadBattle = "bad_battle";
/** A battle to link is not a prepared encounter. */
export type NotPrepared = "not_prepared";

export class AreaRepo {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  list(campaign: Selection = null): AreaSummary[] {
    const scope = campaignClause(campaign);
    const rows = this.db
      .prepare(`SELECT * FROM areas${scope.sql ? ` WHERE ${scope.sql}` : ""} ORDER BY position, name COLLATE NOCASE, id`)
      .all(...scope.args) as AreaRow[];
    const battles = new Map<string, number>();
    for (const row of this.db.prepare("SELECT area_id, COUNT(*) AS n FROM area_encounters GROUP BY area_id").all() as { area_id: string; n: number }[]) {
      battles.set(row.area_id, Number(row.n));
    }
    const rewards = new Map<string, { total: number; done: number }>();
    for (const row of this.db.prepare("SELECT area_id, status FROM area_rewards").all() as { area_id: string; status: string }[]) {
      const entry = rewards.get(row.area_id) ?? { total: 0, done: 0 };
      entry.total++;
      if (DONE_STATUSES.includes(row.status)) entry.done++;
      rewards.set(row.area_id, entry);
    }
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      summary: row.summary,
      campaignId: row.campaign_id,
      position: Number(row.position),
      updatedAt: row.updated_at,
      battles: battles.get(row.id) ?? 0,
      rewardsTotal: rewards.get(row.id)?.total ?? 0,
      rewardsDone: rewards.get(row.id)?.done ?? 0,
    }));
  }

  get(id: string): Area | null {
    if (!AREA_ID.test(id)) return null;
    const row = this.db.prepare("SELECT * FROM areas WHERE id = ?").get(id) as AreaRow | undefined;
    return row ? toArea(row) : null;
  }

  /** Returns null when the limit for that campaign is reached. */
  create(input: AreaInput): Area | null {
    const value = areaSchema.parse(input);
    const campaignId = value.campaignId ?? null;
    const scope = campaignClause(campaignId ?? "unassigned");
    const { n, next } = this.db
      .prepare(`SELECT COUNT(*) AS n, COALESCE(MAX(position), -1) + 1 AS next FROM areas WHERE ${scope.sql}`)
      .get(...scope.args) as { n: number; next: number };
    if (Number(n) >= MAX_AREAS) return null;
    const id = this.newId();
    const at = this.now().toISOString();
    this.db
      .prepare("INSERT INTO areas (id, campaign_id, name, summary, notes, position, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)")
      .run(id, campaignId, value.name, value.summary, value.notes, Number(next), at, at);
    return this.get(id);
  }

  update(id: string, version: number, input: AreaInput): Area | Conflict | null {
    if (!AREA_ID.test(id)) return null;
    const value = areaSchema.parse(input);
    const at = this.now().toISOString();
    const result =
      value.campaignId === undefined
        ? this.db
            .prepare("UPDATE areas SET name = ?, summary = ?, notes = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
            .run(value.name, value.summary, value.notes, at, id, version)
        : this.db
            .prepare("UPDATE areas SET name = ?, summary = ?, notes = ?, campaign_id = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
            .run(value.name, value.summary, value.notes, value.campaignId, at, id, version);
    if (Number(result.changes) > 0) return this.get(id);
    return this.get(id) ? "conflict" : null;
  }

  remove(id: string): boolean {
    if (!AREA_ID.test(id)) return false;
    return Number(this.db.prepare("DELETE FROM areas WHERE id = ?").run(id).changes) > 0;
  }

  /** Puts the named areas in that order; ids that do not exist are ignored. */
  reorder(ids: readonly string[]): void {
    const set = this.db.prepare("UPDATE areas SET position = ? WHERE id = ?");
    this.transaction(() => ids.forEach((id, index) => set.run(index, id)));
  }

  // --- battles -------------------------------------------------------------

  encounterIds(areaId: string): string[] {
    return (
      this.db.prepare("SELECT encounter_id FROM area_encounters WHERE area_id = ? ORDER BY position").all(areaId) as { encounter_id: string }[]
    ).map((row) => row.encounter_id);
  }

  /**
   * Replaces the area's battles. A new link must be a prepared encounter that
   * exists; one already linked stays even if it was launched or deleted since. A
   * reward tied to a battle that is no longer linked falls back to the whole area.
   */
  setEncounters(areaId: string, version: number, encounterIds: readonly string[]): Area | Conflict | NotPrepared | null {
    if (!AREA_ID.test(areaId)) return null;
    const unique = [...new Set(encounterIds)];
    const linked = new Set(this.encounterIds(areaId));
    const isPrepared = this.db.prepare("SELECT 1 FROM encounters WHERE id = ? AND kind = 'prepared'");
    if (unique.some((id) => !linked.has(id) && !isPrepared.get(id))) return "not_prepared";
    return this.transaction(() => {
      const bumped = this.db
        .prepare("UPDATE areas SET version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
        .run(this.now().toISOString(), areaId, version);
      if (Number(bumped.changes) === 0) return this.get(areaId) ? "conflict" : null;
      this.db.prepare("DELETE FROM area_encounters WHERE area_id = ?").run(areaId);
      const insert = this.db.prepare("INSERT INTO area_encounters (area_id, encounter_id, position) VALUES (?, ?, ?)");
      unique.forEach((id, index) => insert.run(areaId, id, index));
      const marks = unique.map(() => "?").join(", ");
      this.db
        .prepare(`UPDATE area_rewards SET encounter_id = NULL WHERE area_id = ? AND encounter_id IS NOT NULL${unique.length ? ` AND encounter_id NOT IN (${marks})` : ""}`)
        .run(areaId, ...unique);
      return this.get(areaId);
    });
  }

  // --- rewards -------------------------------------------------------------

  rewards(areaId: string): Reward[] {
    const rows = this.db
      .prepare("SELECT id, encounter_id, kind, status, data FROM area_rewards WHERE area_id = ? ORDER BY position")
      .all(areaId) as RewardRow[];
    const out: Reward[] = [];
    for (const row of rows) {
      try {
        const data = JSON.parse(row.data) as object;
        const parsed = rewardInputSchema.safeParse({ kind: row.kind, encounterId: row.encounter_id, status: row.status, ...data });
        // A damaged row is skipped rather than shown.
        if (parsed.success) out.push({ ...parsed.data, id: row.id });
      } catch {
        // Same: not JSON, so not shown.
      }
    }
    return out;
  }

  /** Replaces the area's rewards, keeping the ids of ones that are sent back. */
  setRewards(areaId: string, version: number, inputs: readonly RewardInput[]): Area | Conflict | BadBattle | null {
    if (!AREA_ID.test(areaId)) return null;
    const rewards = inputs.map((input) => rewardInputSchema.parse(input));
    const linked = new Set(this.encounterIds(areaId));
    if (rewards.some((reward) => reward.encounterId !== null && !linked.has(reward.encounterId))) return "bad_battle";
    return this.transaction(() => {
      const bumped = this.db
        .prepare("UPDATE areas SET version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
        .run(this.now().toISOString(), areaId, version);
      if (Number(bumped.changes) === 0) return this.get(areaId) ? "conflict" : null;
      const existing = new Set((this.db.prepare("SELECT id FROM area_rewards WHERE area_id = ?").all(areaId) as { id: string }[]).map((row) => row.id));
      this.db.prepare("DELETE FROM area_rewards WHERE area_id = ?").run(areaId);
      const insert = this.db.prepare(
        "INSERT INTO area_rewards (id, area_id, encounter_id, kind, status, position, ref_key, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      );
      const used = new Set<string>();
      rewards.forEach((reward, index) => {
        // An id is only honoured when it belongs to this area and is not repeated.
        const id = reward.id && existing.has(reward.id) && !used.has(reward.id) ? reward.id : this.newId();
        used.add(id);
        insert.run(
          id,
          areaId,
          reward.encounterId,
          reward.kind,
          reward.status,
          index,
          reward.kind === "item" ? refKey(reward.itemRef) : null,
          JSON.stringify(rewardData(reward)),
        );
      });
      return this.get(areaId);
    });
  }

  /** Ticks one reward. Null when it is unknown; "wrong_kind" when the status belongs to the other kind. */
  setRewardStatus(areaId: string, rewardId: string, status: string): Reward | "wrong_kind" | null {
    if (!AREA_ID.test(areaId) || !REWARD_ID.test(rewardId) || !rewardStatusSchema.safeParse(status).success) return null;
    const row = this.db.prepare("SELECT kind FROM area_rewards WHERE id = ? AND area_id = ?").get(rewardId, areaId) as { kind: string } | undefined;
    if (!row) return null;
    const allowed = row.kind === "item" ? ["planned", "given", "skipped"] : ["pending", "earned", "lost"];
    if (!allowed.includes(status)) return "wrong_kind";
    this.db.prepare("UPDATE area_rewards SET status = ? WHERE id = ?").run(status, rewardId);
    return this.rewards(areaId).find((reward) => reward.id === rewardId) ?? null;
  }
}
