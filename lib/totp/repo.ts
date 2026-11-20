import type { DatabaseSync } from "node:sqlite";

export const MAX_FAILS = 5;
export const LOCK_MS = 15 * 60_000;

export type TotpCredential = { userId: string; secretEnc: string; status: "pending" | "active"; lastCounter: number };

type Row = { user_id: string; secret_enc: string; status: "pending" | "active"; last_counter: number };

export class TotpRepo {
  constructor(private readonly db: DatabaseSync) {}

  get(userId: string): TotpCredential | null {
    const row = this.db.prepare("SELECT * FROM totp_credentials WHERE user_id = ?").get(userId) as Row | undefined;
    return row ? { userId: row.user_id, secretEnc: row.secret_enc, status: row.status, lastCounter: Number(row.last_counter) } : null;
  }

  /** Begin (or restart) setup: the card stays unusable until activate(). */
  startSetup(userId: string, secretEnc: string, nowMs: number): void {
    this.db
      .prepare(
        `INSERT INTO totp_credentials (user_id, secret_enc, status, last_counter, created_at) VALUES (?, ?, 'pending', 0, ?)
         ON CONFLICT(user_id) DO UPDATE SET secret_enc = excluded.secret_enc, status = 'pending', last_counter = 0`,
      )
      .run(userId, secretEnc, new Date(nowMs).toISOString());
  }

  activate(userId: string, counter: number): void {
    this.db.prepare("UPDATE totp_credentials SET status = 'active', last_counter = ? WHERE user_id = ?").run(counter, userId);
    this.clearFails(userId);
  }

  remove(userId: string): void {
    this.db.prepare("DELETE FROM totp_credentials WHERE user_id = ?").run(userId);
    this.clearFails(userId);
  }

  activeUserIds(): string[] {
    const rows = this.db.prepare("SELECT user_id FROM totp_credentials WHERE status = 'active' ORDER BY created_at").all() as { user_id: string }[];
    return rows.map((row) => row.user_id);
  }

  /** Use a counter once: false when it is not newer than the last accepted one (a replay). */
  advanceCounter(userId: string, counter: number): boolean {
    return Number(this.db.prepare("UPDATE totp_credentials SET last_counter = ? WHERE user_id = ? AND last_counter < ?").run(counter, userId, counter).changes) === 1;
  }

  /** Epoch ms until which the card is locked; 0 when it is not. */
  lockedUntil(userId: string): number {
    const row = this.db.prepare("SELECT locked_until FROM totp_attempts WHERE user_id = ?").get(userId) as { locked_until: number } | undefined;
    return row ? Number(row.locked_until) : 0;
  }

  recordFail(userId: string, nowMs: number): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("INSERT OR IGNORE INTO totp_attempts (user_id) VALUES (?)").run(userId);
      const row = this.db.prepare("SELECT fails FROM totp_attempts WHERE user_id = ?").get(userId) as { fails: number };
      const fails = Number(row.fails) + 1;
      if (fails >= MAX_FAILS) this.db.prepare("UPDATE totp_attempts SET fails = 0, locked_until = ? WHERE user_id = ?").run(nowMs + LOCK_MS, userId);
      else this.db.prepare("UPDATE totp_attempts SET fails = ? WHERE user_id = ?").run(fails, userId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  clearFails(userId: string): void {
    this.db.prepare("DELETE FROM totp_attempts WHERE user_id = ?").run(userId);
  }
}
