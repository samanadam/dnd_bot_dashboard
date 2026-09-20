import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

// Each entry runs once, in order, inside a transaction. Never edit an entry
// after it has shipped; append a new one.
const MIGRATIONS: readonly string[] = [
  `CREATE TABLE creatures (
     id TEXT PRIMARY KEY,
     kind TEXT NOT NULL CHECK (kind IN ('monster', 'npc')),
     name TEXT NOT NULL,
     data TEXT NOT NULL,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE INDEX creatures_kind_name ON creatures (kind, name);`,
  `CREATE TABLE encounters (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     version INTEGER NOT NULL,
     data TEXT NOT NULL,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE INDEX encounters_updated ON encounters (updated_at);`,
  // Campaigns live in the bot; the portal only remembers which one an NPC or an
  // encounter belongs to. NULL means unassigned. No foreign key on purpose.
  `ALTER TABLE creatures ADD COLUMN campaign_id TEXT;
   ALTER TABLE encounters ADD COLUMN campaign_id TEXT;
   CREATE INDEX creatures_campaign ON creatures (campaign_id);
   CREATE INDEX encounters_campaign ON encounters (campaign_id);`,
  `CREATE TABLE scenes (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     category TEXT NOT NULL DEFAULT '',
     campaign_id TEXT,
     data TEXT NOT NULL,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE INDEX scenes_campaign ON scenes (campaign_id);`,
  // live: an encounter being run. prepared: a template, launched as a fresh copy.
  `ALTER TABLE encounters ADD COLUMN kind TEXT NOT NULL DEFAULT 'live' CHECK (kind IN ('live', 'prepared'));`,
  // Saved YouTube links. Only the 11-character video id is kept, never a URL; the
  // link is rebuilt from it whenever it is used. One row per (kind, video,
  // campaign), so a video can be music in one campaign and an effect in another.
  `CREATE TABLE saved_tracks (
     id TEXT PRIMARY KEY,
     kind TEXT NOT NULL CHECK (kind IN ('music', 'ambience', 'sfx')),
     video_id TEXT NOT NULL CHECK (length(video_id) = 11),
     title TEXT NOT NULL,
     duration_seconds INTEGER,
     category TEXT NOT NULL DEFAULT '',
     campaign_id TEXT,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE UNIQUE INDEX saved_tracks_unique ON saved_tracks (kind, video_id, COALESCE(campaign_id, ''));
   CREATE INDEX saved_tracks_campaign ON saved_tracks (campaign_id);`,
  // SoundCloud beside YouTube. A row is now (source, ref): the video id for
  // YouTube, the lower-case artist/track path for SoundCloud. SQLite cannot change
  // a CHECK in place, so the table is rebuilt; every existing row is YouTube.
  `CREATE TABLE saved_tracks_next (
     id TEXT PRIMARY KEY,
     source TEXT NOT NULL DEFAULT 'youtube' CHECK (source IN ('youtube', 'soundcloud')),
     kind TEXT NOT NULL CHECK (kind IN ('music', 'ambience', 'sfx')),
     ref TEXT NOT NULL,
     title TEXT NOT NULL,
     duration_seconds INTEGER,
     category TEXT NOT NULL DEFAULT '',
     campaign_id TEXT,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     CHECK ((source = 'youtube' AND length(ref) = 11) OR (source = 'soundcloud' AND length(ref) BETWEEN 3 AND 241))
   );
   INSERT INTO saved_tracks_next (id, source, kind, ref, title, duration_seconds, category, campaign_id, created_at, updated_at)
     SELECT id, 'youtube', kind, video_id, title, duration_seconds, category, campaign_id, created_at, updated_at FROM saved_tracks;
   DROP TABLE saved_tracks;
   ALTER TABLE saved_tracks_next RENAME TO saved_tracks;
   CREATE UNIQUE INDEX saved_tracks_unique ON saved_tracks (source, kind, ref, COALESCE(campaign_id, ''));
   CREATE INDEX saved_tracks_campaign ON saved_tracks (campaign_id);`,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function openDatabase(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA secure_delete = ON;");
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  if (version > MIGRATIONS.length) {
    throw new Error(`Database schema ${version} is newer than this build (${MIGRATIONS.length}).`);
  }
  for (let index = version; index < MIGRATIONS.length; index++) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(MIGRATIONS[index]);
      db.exec(`PRAGMA user_version = ${index + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return db;
}
