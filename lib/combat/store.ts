import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

// Notes players keep on combatants, initiative rolled on the battle page, and
// each campaign's turn-ping settings.

export const NOTE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MAX_NOTES_PER_AUTHOR = 200;

export const noteInputSchema = z
  .object({
    combatantId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
    text: z.string().trim().min(1).max(2000),
    visibility: z.enum(["private", "party"]),
    keep: z.boolean(),
  })
  .strict();
export const noteUpdateSchema = noteInputSchema.omit({ combatantId: true }).partial().strict();

export type StoredNote = {
  id: string;
  campaignId: string;
  encounterId: string;
  encounterName: string;
  combatantId: string;
  targetLabel: string;
  authorUserId: string;
  visibility: "private" | "party";
  keep: boolean;
  text: string;
  createdAt: string;
  updatedAt: string;
};

type NoteRow = {
  id: string;
  campaign_id: string;
  encounter_id: string;
  encounter_name: string;
  combatant_id: string;
  target_label: string;
  author_user_id: string;
  visibility: string;
  keep: number;
  text: string;
  created_at: string;
  updated_at: string;
};

const toNote = (row: NoteRow): StoredNote => ({
  id: row.id,
  campaignId: row.campaign_id,
  encounterId: row.encounter_id,
  encounterName: row.encounter_name,
  combatantId: row.combatant_id,
  targetLabel: row.target_label,
  authorUserId: row.author_user_id,
  visibility: row.visibility === "party" ? "party" : "private",
  keep: row.keep === 1,
  text: row.text,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class NoteRepo {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  get(id: string): StoredNote | null {
    if (!NOTE_ID.test(id)) return null;
    const row = this.db.prepare("SELECT * FROM battle_notes WHERE id = ?").get(id) as NoteRow | undefined;
    return row ? toNote(row) : null;
  }

  /** Notes on one encounter: the viewer's own plus the party's. Everything when viewerUserId is null (the DM). */
  forEncounter(encounterId: string, viewerUserId: string | null): StoredNote[] {
    const rows = (
      viewerUserId === null
        ? this.db.prepare("SELECT * FROM battle_notes WHERE encounter_id = ? ORDER BY created_at, id").all(encounterId)
        : this.db
            .prepare("SELECT * FROM battle_notes WHERE encounter_id = ? AND (author_user_id = ? OR visibility = 'party') ORDER BY created_at, id")
            .all(encounterId, viewerUserId)
    ) as NoteRow[];
    return rows.map(toNote);
  }

  /** Kept notes in a campaign, the same visibility rule. */
  keptInCampaign(campaignId: string, viewerUserId: string | null): StoredNote[] {
    const rows = (
      viewerUserId === null
        ? this.db.prepare("SELECT * FROM battle_notes WHERE campaign_id = ? AND keep = 1 ORDER BY created_at DESC, id").all(campaignId)
        : this.db
            .prepare("SELECT * FROM battle_notes WHERE campaign_id = ? AND keep = 1 AND (author_user_id = ? OR visibility = 'party') ORDER BY created_at DESC, id")
            .all(campaignId, viewerUserId)
    ) as NoteRow[];
    return rows.map(toNote);
  }

  /** null when the author has too many notes on this encounter. */
  create(input: z.infer<typeof noteInputSchema> & { campaignId: string; encounterId: string; encounterName: string; targetLabel: string; authorUserId: string }): StoredNote | null {
    const count = this.db.prepare("SELECT COUNT(*) AS n FROM battle_notes WHERE encounter_id = ? AND author_user_id = ?").get(input.encounterId, input.authorUserId) as { n: number };
    if (Number(count.n) >= MAX_NOTES_PER_AUTHOR) return null;
    const id = this.newId();
    const at = this.now().toISOString();
    this.db
      .prepare(
        `INSERT INTO battle_notes (id, campaign_id, encounter_id, encounter_name, combatant_id, target_label, author_user_id, visibility, keep, text, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.campaignId, input.encounterId, input.encounterName.slice(0, 80), input.combatantId, input.targetLabel.slice(0, 80), input.authorUserId, input.visibility, input.keep ? 1 : 0, input.text, at, at);
    return this.get(id);
  }

  update(id: string, patch: z.infer<typeof noteUpdateSchema>): StoredNote | null {
    const current = this.get(id);
    if (!current) return null;
    const next = { ...current, ...patch };
    this.db
      .prepare("UPDATE battle_notes SET text = ?, visibility = ?, keep = ?, updated_at = ? WHERE id = ?")
      .run(next.text, next.visibility, next.keep ? 1 : 0, this.now().toISOString(), id);
    return this.get(id);
  }

  remove(id: string): boolean {
    if (!NOTE_ID.test(id)) return false;
    return Number(this.db.prepare("DELETE FROM battle_notes WHERE id = ?").run(id).changes) > 0;
  }

  /** The battle is over: notes nobody asked to keep go. */
  purgeFightOnly(encounterId: string): number {
    return Number(this.db.prepare("DELETE FROM battle_notes WHERE encounter_id = ? AND keep = 0").run(encounterId).changes);
  }

  /** The last change to any note a viewer can see, for the battle page's ETag. */
  stamp(encounterId: string): string {
    const row = this.db.prepare("SELECT COUNT(*) AS n, MAX(updated_at) AS at FROM battle_notes WHERE encounter_id = ?").get(encounterId) as { n: number; at: string | null };
    return `${row.n}:${row.at ?? ""}`;
  }
}

export type BattleRoll = { encounterId: string; characterId: string; value: number; breakdown: string; at: string };

export class BattleInitiativeRepo {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  put(encounterId: string, characterId: string, value: number, breakdown: string): void {
    this.db
      .prepare(
        `INSERT INTO battle_initiative (encounter_id, character_id, value, breakdown, at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(encounter_id, character_id) DO UPDATE SET value = excluded.value, breakdown = excluded.breakdown, at = excluded.at`,
      )
      .run(encounterId, characterId, value, breakdown.slice(0, 200), this.now().toISOString());
  }

  list(encounterId: string): BattleRoll[] {
    const rows = this.db.prepare("SELECT * FROM battle_initiative WHERE encounter_id = ? ORDER BY at").all(encounterId) as {
      encounter_id: string;
      character_id: string;
      value: number;
      breakdown: string;
      at: string;
    }[];
    return rows.map((r) => ({ encounterId: r.encounter_id, characterId: r.character_id, value: Number(r.value), breakdown: r.breakdown, at: r.at }));
  }

  remove(encounterId: string, characterId?: string): void {
    if (characterId) this.db.prepare("DELETE FROM battle_initiative WHERE encounter_id = ? AND character_id = ?").run(encounterId, characterId);
    else this.db.prepare("DELETE FROM battle_initiative WHERE encounter_id = ?").run(encounterId);
  }
}

export const campaignSettingsSchema = z
  .object({ turnPing: z.object({ enabled: z.boolean(), channelId: z.string().regex(/^\d{17,20}$/).nullable() }).strict() })
  .strict();
export type CampaignSettings = z.infer<typeof campaignSettingsSchema>;

export class CampaignSettingsRepo {
  constructor(private readonly db: DatabaseSync) {}

  get(campaignId: string): CampaignSettings {
    const row = this.db.prepare("SELECT * FROM campaign_settings WHERE campaign_id = ?").get(campaignId) as
      | { turn_ping_enabled: number; turn_ping_channel_id: string | null }
      | undefined;
    return { turnPing: { enabled: row?.turn_ping_enabled === 1, channelId: row?.turn_ping_channel_id ?? null } };
  }

  put(campaignId: string, settings: CampaignSettings): CampaignSettings {
    this.db
      .prepare(
        `INSERT INTO campaign_settings (campaign_id, turn_ping_enabled, turn_ping_channel_id) VALUES (?, ?, ?)
         ON CONFLICT(campaign_id) DO UPDATE SET turn_ping_enabled = excluded.turn_ping_enabled, turn_ping_channel_id = excluded.turn_ping_channel_id`,
      )
      .run(campaignId, settings.turnPing.enabled ? 1 : 0, settings.turnPing.channelId);
    return this.get(campaignId);
  }
}
