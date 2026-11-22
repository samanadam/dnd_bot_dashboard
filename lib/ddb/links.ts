import type { DatabaseSync } from "node:sqlite";

// Which portal sheet mirrors which D&D Beyond character. A sheet with a row here
// is "synced": the sync endpoint writes it and the portal refuses other edits.

export class DdbLinkRepo {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  find(userId: string, ddbCharacterId: string): { sheetId: string; capturedAt: string } | null {
    const row = this.db.prepare("SELECT sheet_id, captured_at FROM ddb_links WHERE user_id = ? AND ddb_character_id = ?").get(userId, ddbCharacterId) as { sheet_id: string; captured_at: string } | undefined;
    return row ? { sheetId: row.sheet_id, capturedAt: row.captured_at } : null;
  }

  create(sheetId: string, userId: string, ddbCharacterId: string, capturedAt: string): void {
    this.db
      .prepare("INSERT INTO ddb_links (sheet_id, user_id, ddb_character_id, captured_at, synced_at) VALUES (?, ?, ?, ?, ?)")
      .run(sheetId, userId, ddbCharacterId, capturedAt, this.now().toISOString());
  }

  /** A successful sync: remembers when the data was captured and clears the last error. */
  touch(sheetId: string, capturedAt: string): void {
    this.db.prepare("UPDATE ddb_links SET captured_at = ?, synced_at = ?, last_error = NULL WHERE sheet_id = ?").run(capturedAt, this.now().toISOString(), sheetId);
  }

  setError(sheetId: string, message: string): void {
    this.db.prepare("UPDATE ddb_links SET last_error = ? WHERE sheet_id = ?").run(message.slice(0, 200), sheetId);
  }

  status(userId: string): Array<{ sheetId: string; ddbCharacterId: string; syncedAt: string; lastError: string | null }> {
    const rows = this.db.prepare("SELECT sheet_id, ddb_character_id, synced_at, last_error FROM ddb_links WHERE user_id = ? ORDER BY synced_at DESC").all(userId) as Array<{
      sheet_id: string;
      ddb_character_id: string;
      synced_at: string;
      last_error: string | null;
    }>;
    return rows.map((r) => ({ sheetId: r.sheet_id, ddbCharacterId: r.ddb_character_id, syncedAt: r.synced_at, lastError: r.last_error }));
  }
}
