import type { DatabaseSync } from "node:sqlite";
import { NO_DDB_CAMPAIGN, type DdbCampaign } from "./campaign";

// Which portal sheet mirrors which D&D Beyond character. A sheet with a row here
// is "synced": the sync endpoint writes it and the portal refuses other edits.
// Also: which portal campaign a player's D&D Beyond campaign means, and the
// characters still waiting for the player to choose one.

export type LinkStatus = {
  sheetId: string;
  campaignId: string;
  name: string;
  ddbCharacterId: string;
  ddbCampaignId: string | null;
  ddbCampaignName: string | null;
  syncedAt: string;
  lastError: string | null;
};
export type PendingCharacter = { ddbCharacterId: string; name: string; ddbCampaignId: string; ddbCampaignName: string; seenAt: string };

const MAX_PENDING = 50;

export class DdbLinkRepo {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  find(userId: string, ddbCharacterId: string): { sheetId: string; capturedAt: string } | null {
    const row = this.db.prepare("SELECT sheet_id, captured_at FROM ddb_links WHERE user_id = ? AND ddb_character_id = ?").get(userId, ddbCharacterId) as { sheet_id: string; captured_at: string } | undefined;
    return row ? { sheetId: row.sheet_id, capturedAt: row.captured_at } : null;
  }

  create(sheetId: string, userId: string, ddbCharacterId: string, capturedAt: string, ddbCampaign: DdbCampaign | null = null): void {
    this.db
      .prepare("INSERT INTO ddb_links (sheet_id, user_id, ddb_character_id, captured_at, synced_at, ddb_campaign_id, ddb_campaign_name) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(sheetId, userId, ddbCharacterId, capturedAt, this.now().toISOString(), ddbCampaign?.id ?? null, ddbCampaign?.name ?? null);
  }

  /** A successful sync: remembers when the data was captured and clears the last error. */
  touch(sheetId: string, capturedAt: string): void {
    this.db.prepare("UPDATE ddb_links SET captured_at = ?, synced_at = ?, last_error = NULL WHERE sheet_id = ?").run(capturedAt, this.now().toISOString(), sheetId);
  }

  setError(sheetId: string, message: string): void {
    this.db.prepare("UPDATE ddb_links SET last_error = ? WHERE sheet_id = ?").run(message.slice(0, 200), sheetId);
  }

  /** The D&D Beyond campaign the character says it is in now (it can change). */
  setDdbCampaign(sheetId: string, ddbCampaign: DdbCampaign | null): void {
    this.db.prepare("UPDATE ddb_links SET ddb_campaign_id = ?, ddb_campaign_name = ? WHERE sheet_id = ?").run(ddbCampaign?.id ?? null, ddbCampaign?.name ?? null, sheetId);
  }

  /** The player's synced sheets whose character is in this D&D Beyond campaign. */
  sheetsOfDdbCampaign(userId: string, ddbCampaignId: string): string[] {
    // Characters in no D&D Beyond campaign have no id stored; they are keyed NO_DDB_CAMPAIGN.
    const rows = (
      ddbCampaignId === NO_DDB_CAMPAIGN
        ? this.db.prepare("SELECT sheet_id FROM ddb_links WHERE user_id = ? AND ddb_campaign_id IS NULL ORDER BY synced_at DESC").all(userId)
        : this.db.prepare("SELECT sheet_id FROM ddb_links WHERE user_id = ? AND ddb_campaign_id = ? ORDER BY synced_at DESC").all(userId, ddbCampaignId)
    ) as Array<{ sheet_id: string }>;
    return rows.map((r) => r.sheet_id);
  }

  mappedCampaign(userId: string, ddbCampaignId: string): string | null {
    const row = this.db.prepare("SELECT campaign_id FROM ddb_campaign_map WHERE user_id = ? AND ddb_campaign_id = ?").get(userId, ddbCampaignId) as { campaign_id: string } | undefined;
    return row?.campaign_id ?? null;
  }

  mapCampaign(userId: string, ddbCampaignId: string, campaignId: string): void {
    this.db
      .prepare("INSERT INTO ddb_campaign_map (user_id, ddb_campaign_id, campaign_id) VALUES (?, ?, ?) ON CONFLICT (user_id, ddb_campaign_id) DO UPDATE SET campaign_id = excluded.campaign_id")
      .run(userId, ddbCampaignId, campaignId);
  }

  setPending(userId: string, ddbCharacterId: string, name: string, ddbCampaign: DdbCampaign, seenAt: string): void {
    const waiting = Number((this.db.prepare("SELECT COUNT(*) AS n FROM ddb_pending WHERE user_id = ?").get(userId) as { n: number }).n);
    const known = this.db.prepare("SELECT 1 AS x FROM ddb_pending WHERE user_id = ? AND ddb_character_id = ?").get(userId, ddbCharacterId);
    if (waiting >= MAX_PENDING && !known) return;
    this.db
      .prepare(
        `INSERT INTO ddb_pending (user_id, ddb_character_id, name, ddb_campaign_id, ddb_campaign_name, seen_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, ddb_character_id) DO UPDATE SET name = excluded.name, ddb_campaign_id = excluded.ddb_campaign_id, ddb_campaign_name = excluded.ddb_campaign_name, seen_at = excluded.seen_at`,
      )
      .run(userId, ddbCharacterId, name.slice(0, 120), ddbCampaign.id, ddbCampaign.name.slice(0, 120), seenAt);
  }

  clearPending(userId: string, ddbCharacterId: string): void {
    this.db.prepare("DELETE FROM ddb_pending WHERE user_id = ? AND ddb_character_id = ?").run(userId, ddbCharacterId);
  }

  /** Forgets the waiting characters of one D&D Beyond campaign, once the player has chosen where it goes. */
  clearPendingOfCampaign(userId: string, ddbCampaignId: string): void {
    this.db.prepare("DELETE FROM ddb_pending WHERE user_id = ? AND ddb_campaign_id = ?").run(userId, ddbCampaignId);
  }

  pending(userId: string): PendingCharacter[] {
    const rows = this.db.prepare("SELECT ddb_character_id, name, ddb_campaign_id, ddb_campaign_name, seen_at FROM ddb_pending WHERE user_id = ? ORDER BY seen_at DESC").all(userId) as Array<{
      ddb_character_id: string;
      name: string;
      ddb_campaign_id: string;
      ddb_campaign_name: string;
      seen_at: string;
    }>;
    return rows.map((r) => ({ ddbCharacterId: r.ddb_character_id, name: r.name, ddbCampaignId: r.ddb_campaign_id, ddbCampaignName: r.ddb_campaign_name, seenAt: r.seen_at }));
  }

  status(userId: string): LinkStatus[] {
    const rows = this.db
      .prepare(
        `SELECT l.sheet_id, c.campaign_id, c.name, l.ddb_character_id, l.ddb_campaign_id, l.ddb_campaign_name, l.synced_at, l.last_error
         FROM ddb_links l JOIN characters c ON c.id = l.sheet_id WHERE l.user_id = ? ORDER BY l.synced_at DESC`,
      )
      .all(userId) as Array<{ sheet_id: string; campaign_id: string; name: string; ddb_character_id: string; ddb_campaign_id: string | null; ddb_campaign_name: string | null; synced_at: string; last_error: string | null }>;
    return rows.map((r) => ({
      sheetId: r.sheet_id,
      campaignId: r.campaign_id,
      name: r.name,
      ddbCharacterId: r.ddb_character_id,
      ddbCampaignId: r.ddb_campaign_id,
      ddbCampaignName: r.ddb_campaign_name,
      syncedAt: r.synced_at,
      lastError: r.last_error,
    }));
  }
}
