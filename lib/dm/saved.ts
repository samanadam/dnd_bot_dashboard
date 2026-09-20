import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { campaignClause, campaignIdSchema, type Selection } from "@/lib/campaign/selection";
import { UNSAFE_TEXT, VIDEO_ID } from "@/lib/youtube";

// Saved YouTube links: music for the queue, ambience loops and one-shot effects.
// The portal keeps the list; the bot only ever plays what it is handed.
//
// What is stored is the 11-character video id, never a URL. It is matched
// against one strict pattern on the way in and again on the way out, so nothing
// in this table can carry a host, a path or an option flag into a bot call.

export const SAVED_KINDS = ["music", "ambience", "sfx"] as const;
export type SavedKind = (typeof SAVED_KINDS)[number];

export const MAX_SAVED = 500;

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => !UNSAFE_TEXT.test(value), "no control or direction characters");

export const savedSchema = z
  .object({
    kind: z.enum(SAVED_KINDS),
    videoId: z.string().regex(VIDEO_ID, "not a YouTube video id"),
    title: safeText(200).refine((value) => value.length > 0, "a title is required"),
    // Whole seconds; null when the bot did not report a length.
    durationSeconds: z.number().int().min(1).max(86_400).nullable(),
    // Free text, like scene categories: the same word groups items. Empty means none.
    category: safeText(40),
    // Left out on an update it is unchanged; null files the link under no campaign.
    campaignId: campaignIdSchema.nullable().optional(),
  })
  .strict();

export type SavedInput = z.infer<typeof savedSchema>;
export type SavedTrack = Omit<SavedInput, "campaignId"> & {
  id: string;
  campaignId: string | null;
  createdAt: string;
  updatedAt: string;
};

export const SAVED_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Row = {
  id: string;
  kind: string;
  video_id: string;
  title: string;
  duration_seconds: number | null;
  category: string;
  campaign_id: string | null;
  created_at: string;
  updated_at: string;
};

export type SaveResult = { ok: true; item: SavedTrack } | { ok: false; reason: "limit" | "duplicate" | "missing" };

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

export class SavedRepo {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  // Validated again on the way out, so a damaged row never reaches a page.
  private toItem(row: Row | undefined): SavedTrack | null {
    if (!row) return null;
    const parsed = savedSchema.safeParse({
      kind: row.kind,
      videoId: row.video_id,
      title: row.title,
      durationSeconds: row.duration_seconds,
      category: row.category,
      campaignId: row.campaign_id,
    });
    if (!parsed.success) return null;
    return {
      id: row.id,
      kind: parsed.data.kind,
      videoId: parsed.data.videoId,
      title: parsed.data.title,
      durationSeconds: parsed.data.durationSeconds,
      category: parsed.data.category,
      campaignId: row.campaign_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  list(campaign: Selection = null): SavedTrack[] {
    const scope = campaignClause(campaign);
    const rows = this.db
      .prepare(
        `SELECT * FROM saved_tracks${scope.sql ? ` WHERE ${scope.sql}` : ""} ORDER BY kind, category COLLATE NOCASE, title COLLATE NOCASE, id`,
      )
      .all(...scope.args) as Row[];
    return rows.map((row) => this.toItem(row)).filter((item): item is SavedTrack => item !== null);
  }

  count(): number {
    return Number((this.db.prepare("SELECT COUNT(*) AS n FROM saved_tracks").get() as { n: number }).n);
  }

  get(id: string): SavedTrack | null {
    if (!SAVED_ID.test(id)) return null;
    return this.toItem(this.db.prepare("SELECT * FROM saved_tracks WHERE id = ?").get(id) as Row | undefined);
  }

  create(input: SavedInput): SaveResult {
    if (this.count() >= MAX_SAVED) return { ok: false, reason: "limit" };
    const value = savedSchema.parse(input);
    const id = this.newId();
    const at = this.now().toISOString();
    try {
      this.db
        .prepare(
          "INSERT INTO saved_tracks (id, kind, video_id, title, duration_seconds, category, campaign_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(id, value.kind, value.videoId, value.title, value.durationSeconds, value.category, value.campaignId ?? null, at, at);
    } catch (error) {
      if (isUniqueViolation(error)) return { ok: false, reason: "duplicate" };
      throw error;
    }
    const item = this.get(id);
    return item ? { ok: true, item } : { ok: false, reason: "missing" };
  }

  update(id: string, input: SavedInput): SaveResult {
    if (!SAVED_ID.test(id)) return { ok: false, reason: "missing" };
    const value = savedSchema.parse(input);
    const at = this.now().toISOString();
    try {
      const result =
        value.campaignId === undefined
          ? this.db
              .prepare("UPDATE saved_tracks SET kind = ?, video_id = ?, title = ?, duration_seconds = ?, category = ?, updated_at = ? WHERE id = ?")
              .run(value.kind, value.videoId, value.title, value.durationSeconds, value.category, at, id)
          : this.db
              .prepare(
                "UPDATE saved_tracks SET kind = ?, video_id = ?, title = ?, duration_seconds = ?, category = ?, campaign_id = ?, updated_at = ? WHERE id = ?",
              )
              .run(value.kind, value.videoId, value.title, value.durationSeconds, value.category, value.campaignId, at, id);
      if (Number(result.changes) === 0) return { ok: false, reason: "missing" };
    } catch (error) {
      if (isUniqueViolation(error)) return { ok: false, reason: "duplicate" };
      throw error;
    }
    const item = this.get(id);
    return item ? { ok: true, item } : { ok: false, reason: "missing" };
  }

  remove(id: string): boolean {
    if (!SAVED_ID.test(id)) return false;
    return Number(this.db.prepare("DELETE FROM saved_tracks WHERE id = ?").run(id).changes) > 0;
  }
}
