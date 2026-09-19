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
