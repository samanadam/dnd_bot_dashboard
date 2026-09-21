import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { UNSAFE_TEXT } from "@/lib/youtube";

// Tags on sounds. A sound can carry several, and they can be changed at any
// time. What gets tagged is named by a ref, never by a link:
//
//   bucket:<key>   a file in the bot's music bucket (a track, an ambience loop or
//                  an effect), by its bucket key, exactly as the bot lists it
//   saved:<uuid>   a saved YouTube or SoundCloud link, by the id of its row
//
// The portal keeps the tags and the bot never sees them. A tag left behind by a
// file that was deleted straight from the bucket is harmless: nothing lists it.

export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 32;
// How many different sounds may carry tags at all; each row is tiny, this only
// stops a runaway loop from filling the database.
export const MAX_TAGGED = 5000;

export const bucketRef = (id: string) => `bucket:${id}`;
export const savedRef = (id: string) => `saved:${id}`;

const SAVED_REF = /^saved:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BUCKET_PREFIX = "bucket:";
const MAX_KEY_LENGTH = 512;

function isTagRef(value: string): boolean {
  if (SAVED_REF.test(value)) return true;
  if (!value.startsWith(BUCKET_PREFIX)) return false;
  const key = value.slice(BUCKET_PREFIX.length);
  return key.length >= 1 && key.length <= MAX_KEY_LENGTH && !UNSAFE_TEXT.test(key);
}

export const tagSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_TAG_LENGTH)
  .refine((value) => !UNSAFE_TEXT.test(value), "no control or direction characters")
  // A comma is what separates tags when they are typed.
  .refine((value) => !value.includes(","), "no commas");

/** Spaces collapsed, and a tag repeated in another case kept once, as first written. */
export function normaliseTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const tag of tags) {
    const clean = tag.replace(/\s+/g, " ");
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(clean);
  }
  return kept;
}

export const tagsSchema = z.array(tagSchema).max(MAX_TAGS).transform(normaliseTags);

export const setTagsSchema = z
  .object({
    ref: z.string().refine(isTagRef, "not a sound that can be tagged"),
    tags: tagsSchema,
  })
  .strict();

export type TagMap = Record<string, string[]>;
export type SetTagsResult = { ok: true; tags: string[] } | { ok: false; reason: "limit" };

/** Each tag with the number of sounds that carry it, alphabetical ignoring case. */
export function tagCounts(map: TagMap): { tag: string; count: number }[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const tags of Object.values(map)) {
    for (const tag of tags) {
      const key = tag.toLowerCase();
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { tag, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => a.tag.localeCompare(b.tag, undefined, { sensitivity: "base" }));
}

/** True when a sound carries every one of the selected tags. No selection matches everything. */
export function hasAllTags(tags: readonly string[], selected: readonly string[]): boolean {
  if (selected.length === 0) return true;
  const have = new Set(tags.map((tag) => tag.toLowerCase()));
  return selected.every((tag) => have.has(tag.toLowerCase()));
}

type Row = { ref: string; tag: string };

export class TagRepo {
  constructor(private readonly db: DatabaseSync) {}

  /** Every tagged sound. Tags are validated on the way out, so a damaged row never reaches a page. */
  all(): TagMap {
    const rows = this.db.prepare("SELECT ref, tag FROM sound_tags ORDER BY ref, tag COLLATE NOCASE").all() as Row[];
    const map: TagMap = {};
    for (const row of rows) {
      if (!tagSchema.safeParse(row.tag).success) continue;
      (map[row.ref] ??= []).push(row.tag);
    }
    return map;
  }

  get(ref: string): string[] {
    const rows = this.db.prepare("SELECT tag FROM sound_tags WHERE ref = ? ORDER BY tag COLLATE NOCASE").all(ref) as { tag: string }[];
    return rows.map((row) => row.tag).filter((tag) => tagSchema.safeParse(tag).success);
  }

  /** Replaces the whole set. An empty list removes the sound from the table. */
  set(ref: string, tags: string[]): SetTagsResult {
    const clean = normaliseTags(tags);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const known = this.db.prepare("SELECT 1 AS found FROM sound_tags WHERE ref = ? LIMIT 1").get(ref);
      if (clean.length > 0 && !known) {
        const { n } = this.db.prepare("SELECT COUNT(DISTINCT ref) AS n FROM sound_tags").get() as { n: number };
        if (Number(n) >= MAX_TAGGED) {
          this.db.exec("ROLLBACK");
          return { ok: false, reason: "limit" };
        }
      }
      this.db.prepare("DELETE FROM sound_tags WHERE ref = ?").run(ref);
      const insert = this.db.prepare("INSERT OR IGNORE INTO sound_tags (ref, tag) VALUES (?, ?)");
      for (const tag of clean) insert.run(ref, tag);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { ok: true, tags: this.get(ref) };
  }
}
