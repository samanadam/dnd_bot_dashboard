import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { campaignClause, campaignIdSchema, type Selection } from "@/lib/campaign/selection";
import { UNSAFE_TEXT } from "@/lib/youtube";
import { isRef, WEB_SOURCES, type WebSource } from "@/lib/webAudio";
import { savedRef } from "./tags";

// Saved YouTube and SoundCloud links: music for the queue, ambience loops and
// one-shot effects. The portal keeps the list; the bot only ever plays what it is
// handed. How they are grouped is up to tags (tags.ts), not to this table.
//
// What is stored is a reference, never a URL: the 11-character video id for
// YouTube, the lower-case `artist/track` path for SoundCloud. It is matched
// against one strict pattern on the way in and again on the way out, so nothing
// in this table can carry a host, a query string or an option flag into a bot
// call.

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
    source: z.enum(WEB_SOURCES),
    kind: z.enum(SAVED_KINDS),
    ref: z.string().max(241),
    title: safeText(200).refine((value) => value.length > 0, "a title is required"),
    // Whole seconds; null when the bot did not report a length.
    durationSeconds: z.number().int().min(1).max(86_400).nullable(),
    // Left out on an update it is unchanged; null files the link under no campaign.
    campaignId: campaignIdSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => isRef(value.source, value.ref), { path: ["ref"], message: "not a valid link for that source" });

export type { WebSource };
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
  source: string;
  kind: string;
  ref: string;
  title: string;
  duration_seconds: number | null;
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
      source: row.source,
      kind: row.kind,
      ref: row.ref,
      title: row.title,
      durationSeconds: row.duration_seconds,
      campaignId: row.campaign_id,
    });
    if (!parsed.success) return null;
    return {
      id: row.id,
      source: parsed.data.source,
      kind: parsed.data.kind,
      ref: parsed.data.ref,
      title: parsed.data.title,
      durationSeconds: parsed.data.durationSeconds,
      campaignId: row.campaign_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  list(campaign: Selection = null): SavedTrack[] {
    const scope = campaignClause(campaign);
    const rows = this.db
      .prepare(
        `SELECT * FROM saved_tracks${scope.sql ? ` WHERE ${scope.sql}` : ""} ORDER BY kind, title COLLATE NOCASE, id`,
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
          "INSERT INTO saved_tracks (id, source, kind, ref, title, duration_seconds, campaign_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(id, value.source, value.kind, value.ref, value.title, value.durationSeconds, value.campaignId ?? null, at, at);
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
              .prepare("UPDATE saved_tracks SET source = ?, kind = ?, ref = ?, title = ?, duration_seconds = ?, updated_at = ? WHERE id = ?")
              .run(value.source, value.kind, value.ref, value.title, value.durationSeconds, at, id)
          : this.db
              .prepare(
                "UPDATE saved_tracks SET source = ?, kind = ?, ref = ?, title = ?, duration_seconds = ?, campaign_id = ?, updated_at = ? WHERE id = ?",
              )
              .run(value.source, value.kind, value.ref, value.title, value.durationSeconds, value.campaignId, at, id);
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
    const removed = Number(this.db.prepare("DELETE FROM saved_tracks WHERE id = ?").run(id).changes) > 0;
    // Its tags go with it; they are in this same database.
    if (removed) this.db.prepare("DELETE FROM sound_tags WHERE ref = ?").run(savedRef(id));
    return removed;
  }
}
