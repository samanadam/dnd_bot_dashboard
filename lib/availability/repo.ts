import type { DatabaseSync } from "node:sqlite";

/** v1 has one campaign; the column exists so more are rows later. */
export const CAMPAIGN = "default";

export class AvailabilityRepo {
  constructor(private readonly db: DatabaseSync) {}

  private inTransaction<T>(work: () => T): T {
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

  /** Replace the user's free days from `today` on; earlier days stay as they were. */
  setFreeDays(campaignId: string, userId: string, days: readonly string[], today: string): void {
    this.inTransaction(() => {
      this.db.prepare("DELETE FROM availability WHERE campaign_id = ? AND user_id = ? AND day >= ?").run(campaignId, userId, today);
      const insert = this.db.prepare("INSERT OR IGNORE INTO availability (campaign_id, user_id, day) VALUES (?, ?, ?)");
      for (const day of new Set(days)) if (day >= today) insert.run(campaignId, userId, day);
    });
  }

  /** day -> user ids who are free, for days in [from, to]. */
  freeByDay(campaignId: string, from: string, to: string): Record<string, string[]> {
    const rows = this.db
      .prepare("SELECT day, user_id FROM availability WHERE campaign_id = ? AND day BETWEEN ? AND ? ORDER BY day, user_id")
      .all(campaignId, from, to) as { day: string; user_id: string }[];
    const out: Record<string, string[]> = {};
    for (const row of rows) (out[row.day] ??= []).push(row.user_id);
    return out;
  }

  players(campaignId: string): string[] {
    const rows = this.db.prepare("SELECT user_id FROM campaign_players WHERE campaign_id = ? ORDER BY user_id").all(campaignId) as { user_id: string }[];
    return rows.map((row) => row.user_id);
  }

  setPlayers(campaignId: string, userIds: readonly string[]): void {
    this.inTransaction(() => {
      this.db.prepare("DELETE FROM campaign_players WHERE campaign_id = ?").run(campaignId);
      const insert = this.db.prepare("INSERT OR IGNORE INTO campaign_players (campaign_id, user_id) VALUES (?, ?)");
      for (const id of new Set(userIds)) insert.run(campaignId, id);
    });
  }

  /** Give claimed days back (a failed send), so the next save tries them again. */
  unclaim(campaignId: string, days: readonly string[]): void {
    const del = this.db.prepare("DELETE FROM announced_days WHERE campaign_id = ? AND day = ?");
    for (const day of days) del.run(campaignId, day);
  }

  /**
   * Future days every player is free on that were never announced, claimed in one
   * transaction: the insert is the lock, so two saves cannot both get a day.
   */
  claimUnanimous(campaignId: string, today: string): string[] {
    return this.inTransaction(() => {
      const total = this.players(campaignId).length;
      if (total < 2) return [];
      const candidates = this.db
        .prepare(
          `SELECT a.day FROM availability a
           JOIN campaign_players p ON p.campaign_id = a.campaign_id AND p.user_id = a.user_id
           WHERE a.campaign_id = ? AND a.day > ?
             AND NOT EXISTS (SELECT 1 FROM announced_days d WHERE d.campaign_id = a.campaign_id AND d.day = a.day)
           GROUP BY a.day HAVING COUNT(*) = ? ORDER BY a.day`,
        )
        .all(campaignId, today, total) as { day: string }[];
      const lock = this.db.prepare("INSERT OR IGNORE INTO announced_days (campaign_id, day, announced_at) VALUES (?, ?, ?)");
      const at = new Date().toISOString();
      return candidates.filter(({ day }) => Number(lock.run(campaignId, day, at).changes) === 1).map(({ day }) => day);
    });
  }
}
