import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

// A campaign's party notes, and the Discord channel each campaign mirrors them to.

export const PARTY_NOTE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MAX_PARTY_NOTES = 500;

export const partyNoteSchema = z.object({ text: z.string().trim().min(1).max(1500) }).strict();
export const channelSchema = z.object({ channelId: z.string().regex(/^\d{17,20}$/).nullable() }).strict();

export type PartyNote = {
  id: string;
  campaignId: string;
  authorUserId: string;
  authorName: string;
  text: string;
  discordMessageId: string | null;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  campaign_id: string;
  author_user_id: string;
  author_name: string;
  text: string;
  discord_message_id: string | null;
  created_at: string;
  updated_at: string;
};

const toNote = (row: Row): PartyNote => ({
  id: row.id,
  campaignId: row.campaign_id,
  authorUserId: row.author_user_id,
  authorName: row.author_name,
  text: row.text,
  discordMessageId: row.discord_message_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class PartyNoteRepo {
  constructor(private readonly db: DatabaseSync) {}

  get(id: string): PartyNote | null {
    const row = this.db.prepare("SELECT * FROM party_notes WHERE id = ?").get(id) as Row | undefined;
    return row ? toNote(row) : null;
  }

  byMessage(messageId: string): PartyNote | null {
    const row = this.db.prepare("SELECT * FROM party_notes WHERE discord_message_id = ?").get(messageId) as Row | undefined;
    return row ? toNote(row) : null;
  }

  list(campaignId: string): PartyNote[] {
    const rows = this.db.prepare("SELECT * FROM party_notes WHERE campaign_id = ? ORDER BY created_at DESC, id LIMIT ?").all(campaignId, MAX_PARTY_NOTES) as Row[];
    return rows.map(toNote);
  }

  /** null when the campaign is at its limit. */
  create(input: { campaignId: string; authorUserId: string; authorName: string; text: string; discordMessageId?: string }): PartyNote | null {
    const count = this.db.prepare("SELECT COUNT(*) AS n FROM party_notes WHERE campaign_id = ?").get(input.campaignId) as { n: number };
    if (Number(count.n) >= MAX_PARTY_NOTES) return null;
    const id = randomUUID();
    const at = new Date().toISOString();
    this.db
      .prepare("INSERT INTO party_notes (id, campaign_id, author_user_id, author_name, text, discord_message_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.campaignId, input.authorUserId, input.authorName, input.text, input.discordMessageId ?? null, at, at);
    return this.get(id);
  }

  setMessageId(id: string, messageId: string | null): void {
    this.db.prepare("UPDATE party_notes SET discord_message_id = ? WHERE id = ?").run(messageId, id);
  }

  update(id: string, text: string): PartyNote | null {
    this.db.prepare("UPDATE party_notes SET text = ?, updated_at = ? WHERE id = ?").run(text, new Date().toISOString(), id);
    return this.get(id);
  }

  remove(id: string): boolean {
    return Number(this.db.prepare("DELETE FROM party_notes WHERE id = ?").run(id).changes) > 0;
  }

  channelOf(campaignId: string): string | null {
    const row = this.db.prepare("SELECT channel_id FROM party_note_channels WHERE campaign_id = ?").get(campaignId) as { channel_id: string } | undefined;
    return row?.channel_id ?? null;
  }

  campaignOf(channelId: string): string | null {
    const row = this.db.prepare("SELECT campaign_id FROM party_note_channels WHERE channel_id = ?").get(channelId) as { campaign_id: string } | undefined;
    return row?.campaign_id ?? null;
  }

  channels(): { campaignId: string; channelId: string }[] {
    const rows = this.db.prepare("SELECT campaign_id, channel_id FROM party_note_channels").all() as { campaign_id: string; channel_id: string }[];
    return rows.map((r) => ({ campaignId: r.campaign_id, channelId: r.channel_id }));
  }

  /** false when another campaign already uses that channel. */
  setChannel(campaignId: string, channelId: string | null): boolean {
    if (channelId === null) {
      this.db.prepare("DELETE FROM party_note_channels WHERE campaign_id = ?").run(campaignId);
      return true;
    }
    const taken = this.campaignOf(channelId);
    if (taken && taken !== campaignId) return false;
    this.db
      .prepare("INSERT INTO party_note_channels (campaign_id, channel_id) VALUES (?, ?) ON CONFLICT(campaign_id) DO UPDATE SET channel_id = excluded.channel_id")
      .run(campaignId, channelId);
    return true;
  }
}
