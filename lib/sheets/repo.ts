import type { DatabaseSync } from "node:sqlite";
import { campaignClause, CAMPAIGN_ID, type ScopedSelection } from "@/lib/campaign/selection";
import { newBody, sheetBodySchema, type SheetBody } from "./body";
import { derive } from "./derive";
import { applyOps, type Op, type OpContext, type OpResult } from "./ops";
import type { Edition } from "./rules";
import { newVitals, vitalsSchema, type Vitals } from "./vitals";

// Character sheets in the portal's database. Rows are validated on the way out,
// so a damaged one never reaches a page.

export const SHEET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MAX_SHEETS_PER_PLAYER = 20;
export const MAX_SHEETS = 500;

export type SheetStatus = "active" | "retired" | "dead";

export type StoredSheet = {
  id: string;
  campaignId: string;
  ownerUserId: string | null;
  name: string;
  edition: Edition;
  status: SheetStatus;
  active: boolean;
  version: number;
  body: SheetBody;
  vitalsVersion: number;
  vitals: Vitals;
  dmNotes: string;
  portrait: string | null;
  nameSync: "ok" | "pending";
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  campaign_id: string;
  owner_user_id: string | null;
  name: string;
  edition: string;
  status: string;
  is_active: number;
  version: number;
  body: string;
  vitals_version: number;
  vitals: string;
  dm_notes: string;
  portrait: string | null;
  name_sync: string;
  created_at: string;
  updated_at: string;
};

function parse<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }, text: string): T | null {
  try {
    const result = schema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export type OpsOutcome = { ok: true; sheet: StoredSheet; results: OpResult[] } | { ok: false; reason: string; index: number } | null;

export class SheetRepo {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  private toSheet(row: Row | undefined): StoredSheet | null {
    if (!row) return null;
    const body = parse(sheetBodySchema, row.body);
    const vitals = parse(vitalsSchema, row.vitals);
    if (!body || !vitals || (row.edition !== "2014" && row.edition !== "2024")) return null;
    return {
      id: row.id,
      campaignId: row.campaign_id,
      ownerUserId: row.owner_user_id,
      name: row.name,
      edition: row.edition,
      status: row.status as SheetStatus,
      active: row.is_active === 1,
      version: Number(row.version),
      body,
      vitalsVersion: Number(row.vitals_version),
      vitals,
      dmNotes: row.dm_notes,
      portrait: row.portrait,
      nameSync: row.name_sync === "pending" ? "pending" : "ok",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  get(id: string): StoredSheet | null {
    if (!SHEET_ID.test(id)) return null;
    return this.toSheet(this.db.prepare("SELECT * FROM characters WHERE id = ?").get(id) as Row | undefined);
  }

  /** Sheets in the given campaigns, optionally only one player's. */
  list(campaigns: ScopedSelection, ownerUserId?: string): StoredSheet[] {
    const scope = campaignClause(campaigns);
    const where = [scope.sql, ownerUserId ? "owner_user_id = ?" : ""].filter(Boolean);
    const rows = this.db
      .prepare(`SELECT * FROM characters${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY name COLLATE NOCASE, id`)
      .all(...scope.args, ...(ownerUserId ? [ownerUserId] : [])) as Row[];
    return rows.map((row) => this.toSheet(row)).filter((sheet): sheet is StoredSheet => sheet !== null);
  }

  /** The sheet combat and the bot use for this player in this campaign. */
  activeFor(campaignId: string, ownerUserId: string): StoredSheet | null {
    return this.toSheet(
      this.db.prepare("SELECT * FROM characters WHERE campaign_id = ? AND owner_user_id = ? AND is_active = 1").get(campaignId, ownerUserId) as Row | undefined,
    );
  }

  /** Returns "limit" when the player (or the portal) holds too many sheets already. */
  create(input: { campaignId: string; ownerUserId: string | null; edition: Edition; name: string; body?: SheetBody; vitals?: Vitals }): StoredSheet | "limit" {
    if (!CAMPAIGN_ID.test(input.campaignId)) throw new Error("invalid campaign id");
    const body = sheetBodySchema.parse(input.body ?? newBody(input.name));
    return this.transaction(() => {
      const total = Number((this.db.prepare("SELECT COUNT(*) AS n FROM characters").get() as { n: number }).n);
      if (total >= MAX_SHEETS) return "limit" as const;
      let active = 0;
      if (input.ownerUserId) {
        const mine = this.db.prepare("SELECT COUNT(*) AS n, SUM(is_active) AS a FROM characters WHERE campaign_id = ? AND owner_user_id = ?").get(input.campaignId, input.ownerUserId) as {
          n: number;
          a: number | null;
        };
        if (Number(mine.n) >= MAX_SHEETS_PER_PLAYER) return "limit" as const;
        // A player's first sheet in a campaign is the one in play.
        active = Number(mine.a ?? 0) === 0 ? 1 : 0;
      }
      const vitals = vitalsSchema.parse(input.vitals ?? newVitals(derive(body, newVitals(1), input.edition).maxHp));
      const id = this.newId();
      const at = this.now().toISOString();
      this.db
        .prepare(
          `INSERT INTO characters (id, campaign_id, owner_user_id, name, edition, status, is_active, version, body, vitals_version, vitals, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'active', ?, 1, ?, 1, ?, ?, ?)`,
        )
        .run(id, input.campaignId, input.ownerUserId, body.identity.name, input.edition, active, JSON.stringify(body), JSON.stringify(vitals), at, at);
      return this.get(id)!;
    });
  }

  /** Saves the body when `expectedVersion` is still current. */
  saveBody(id: string, expectedVersion: number, body: SheetBody, edition?: Edition): StoredSheet | "conflict" | null {
    if (!SHEET_ID.test(id)) return null;
    const value = sheetBodySchema.parse(body);
    const at = this.now().toISOString();
    const result = this.db
      .prepare(
        `UPDATE characters SET body = ?, name = ?, edition = COALESCE(?, edition), version = version + 1, updated_at = ? WHERE id = ? AND version = ?`,
      )
      .run(JSON.stringify(value), value.identity.name, edition ?? null, at, id, expectedVersion);
    if (Number(result.changes) === 0) return this.get(id) ? "conflict" : null;
    return this.get(id);
  }

  /** Applies operations to the vitals in one transaction: all or none. */
  applyOps(id: string, ops: readonly Op[], context: (sheet: StoredSheet) => OpContext): OpsOutcome {
    if (!SHEET_ID.test(id)) return null;
    return this.transaction(() => {
      const sheet = this.get(id);
      if (!sheet) return null;
      const applied = applyOps(sheet.vitals, ops, context(sheet));
      if (!applied.ok) return applied;
      this.db
        .prepare("UPDATE characters SET vitals = ?, vitals_version = vitals_version + 1, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(vitalsSchema.parse(applied.vitals)), this.now().toISOString(), id);
      return { ok: true as const, sheet: this.get(id)!, results: applied.results };
    });
  }

  /** Owner, active flag, status and DM notes. Making a sheet active retires the player's other active one. */
  setMeta(id: string, patch: { ownerUserId?: string | null; active?: boolean; status?: SheetStatus; dmNotes?: string }): StoredSheet | null {
    if (!SHEET_ID.test(id)) return null;
    return this.transaction(() => {
      const sheet = this.get(id);
      if (!sheet) return null;
      const at = this.now().toISOString();
      if (patch.ownerUserId !== undefined && patch.ownerUserId !== sheet.ownerUserId) {
        // A new owner: it stops being anyone's active sheet, then becomes theirs if they have none.
        let active = 0;
        if (patch.ownerUserId) {
          const theirs = this.db.prepare("SELECT COUNT(*) AS n FROM characters WHERE campaign_id = ? AND owner_user_id = ? AND is_active = 1").get(sheet.campaignId, patch.ownerUserId) as { n: number };
          active = Number(theirs.n) === 0 ? 1 : 0;
        }
        this.db.prepare("UPDATE characters SET owner_user_id = ?, is_active = ?, updated_at = ? WHERE id = ?").run(patch.ownerUserId, active, at, id);
      }
      const current = this.get(id)!;
      if (patch.active !== undefined && current.ownerUserId) {
        if (patch.active) {
          this.db.prepare("UPDATE characters SET is_active = 0 WHERE campaign_id = ? AND owner_user_id = ? AND id <> ?").run(current.campaignId, current.ownerUserId, id);
          this.db.prepare("UPDATE characters SET is_active = 1, status = 'active', updated_at = ? WHERE id = ?").run(at, id);
        } else this.db.prepare("UPDATE characters SET is_active = 0, updated_at = ? WHERE id = ?").run(at, id);
      }
      if (patch.status !== undefined) {
        // A retired or dead character is not the one in play.
        const active = patch.status === "active" ? (this.get(id)!.active ? 1 : 0) : 0;
        this.db.prepare("UPDATE characters SET status = ?, is_active = ?, updated_at = ? WHERE id = ?").run(patch.status, active, at, id);
      }
      if (patch.dmNotes !== undefined) this.db.prepare("UPDATE characters SET dm_notes = ?, updated_at = ? WHERE id = ?").run(patch.dmNotes, at, id);
      return this.get(id);
    });
  }

  setNameSync(id: string, state: "ok" | "pending"): void {
    if (SHEET_ID.test(id)) this.db.prepare("UPDATE characters SET name_sync = ? WHERE id = ?").run(state, id);
  }

  setPortrait(id: string, file: string | null): void {
    if (SHEET_ID.test(id)) this.db.prepare("UPDATE characters SET portrait = ?, updated_at = ? WHERE id = ?").run(file, this.now().toISOString(), id);
  }

  remove(id: string): boolean {
    if (!SHEET_ID.test(id)) return false;
    return Number(this.db.prepare("DELETE FROM characters WHERE id = ?").run(id).changes) > 0;
  }

  /** Version numbers only, for cheap polling. */
  versions(ids: readonly string[]): Map<string, { version: number; vitalsVersion: number }> {
    const valid = ids.filter((id) => SHEET_ID.test(id)).slice(0, 60);
    if (valid.length === 0) return new Map();
    const rows = this.db
      .prepare(`SELECT id, version, vitals_version FROM characters WHERE id IN (${valid.map(() => "?").join(", ")})`)
      .all(...valid) as { id: string; version: number; vitals_version: number }[];
    return new Map(rows.map((row) => [row.id, { version: Number(row.version), vitalsVersion: Number(row.vitals_version) }]));
  }
}
