import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

// The table's rolls: the portal's own and the ones relayed from D&D Beyond, per campaign. A roll is
// for everyone or for the DM only; a DM-only roll is seen by the DM and by whoever rolled it.

export type RollVisibility = "everyone" | "dm";
export type RollSource = "portal" | "ddb";
export type NewTableRoll = {
  campaignId: string;
  userId: string;
  sheetId: string | null;
  who: string;
  label: string;
  expression: string;
  total: number;
  breakdown: string;
  visibility: RollVisibility;
  source: RollSource;
};
export type TableRoll = Omit<NewTableRoll, "campaignId" | "userId"> & { id: string; at: string; mine: boolean };
export type Viewer = { userId: string; seesAll: boolean };

export const MAX_TABLE_ROLLS = 200;

type Row = { id: string; user_id: string; sheet_id: string | null; who: string; label: string; expression: string; total: number; breakdown: string; visibility: RollVisibility; source: RollSource; created_at: string };

export class TableRollRepo {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  add(roll: NewTableRoll): void {
    this.db
      .prepare("INSERT INTO table_rolls (id, campaign_id, user_id, sheet_id, who, label, expression, total, breakdown, visibility, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), roll.campaignId, roll.userId, roll.sheetId, roll.who.slice(0, 120), roll.label.slice(0, 80), roll.expression.slice(0, 100), Math.trunc(roll.total), roll.breakdown.slice(0, 300), roll.visibility, roll.source, this.now().toISOString());
    // Only the latest rolls of the campaign are kept.
    this.db
      .prepare("DELETE FROM table_rolls WHERE campaign_id = ? AND id NOT IN (SELECT id FROM table_rolls WHERE campaign_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)")
      .run(roll.campaignId, roll.campaignId, MAX_TABLE_ROLLS);
  }

  /** The rolls this viewer may see, newest first. */
  list(campaignId: string, viewer: Viewer, limit = 50): TableRoll[] {
    const rows = this.db
      .prepare(
        "SELECT id, user_id, sheet_id, who, label, expression, total, breakdown, visibility, source, created_at FROM table_rolls WHERE campaign_id = ? AND (visibility = 'everyone' OR ? = 1 OR user_id = ?) ORDER BY created_at DESC, rowid DESC LIMIT ?",
      )
      .all(campaignId, viewer.seesAll ? 1 : 0, viewer.userId, Math.max(1, Math.min(MAX_TABLE_ROLLS, limit))) as Row[];
    return rows.map((r) => ({
      id: r.id,
      sheetId: r.sheet_id,
      who: r.who,
      label: r.label,
      expression: r.expression,
      total: r.total,
      breakdown: r.breakdown,
      visibility: r.visibility,
      source: r.source,
      at: r.created_at,
      mine: r.user_id === viewer.userId,
    }));
  }
}
