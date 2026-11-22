import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { campaignClause, campaignIdSchema, type ScopedSelection } from "@/lib/campaign/selection";

// The DM's story wiki: notes of any type that link to each other with [[Title]].
// Links are never stored. They are read out of the bodies, so renaming a note
// rewrites the links to it in the same transaction, and a note deleted behind a
// link just leaves that link "missing".

export const NOTE_TYPES = ["place", "npc", "faction", "event", "secret", "plot", "session", "other"] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export const MAX_STORY_NOTES = 2000;
export const STORY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const storyNoteSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    type: z.enum(NOTE_TYPES),
    tags: z.array(z.string().trim().min(1).max(32)).max(12),
    body: z.string().max(50_000),
    campaignId: campaignIdSchema.nullable().optional(),
  })
  .strict();
export const storyNoteUpdateSchema = storyNoteSchema.extend({ version: z.number().int().min(1) }).strict();

export type StoryInput = z.infer<typeof storyNoteSchema>;
export type StoryNote = {
  id: string;
  title: string;
  type: NoteType;
  tags: string[];
  body: string;
  campaignId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type StorySummary = Pick<StoryNote, "id" | "title" | "type" | "tags" | "campaignId" | "updatedAt"> & {
  /** Ids of the notes this one links to, in its own campaign. */
  links: string[];
  /** Linked titles that no note has. */
  missing: string[];
};

type Row = {
  id: string;
  campaign_id: string | null;
  title: string;
  type: string;
  tags: string;
  body: string;
  version: number;
  created_at: string;
  updated_at: string;
};

const toNote = (row: Row): StoryNote => ({
  id: row.id,
  title: row.title,
  type: row.type as NoteType,
  tags: JSON.parse(row.tags) as string[],
  body: row.body,
  campaignId: row.campaign_id,
  version: Number(row.version),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const WIKILINK = /\[\[([^\[\]\n]+)\]\]/g;
const key = (campaignId: string | null, title: string) => `${campaignId ?? ""}|${title.trim().toLowerCase()}`;

/** Titles inside [[…]], trimmed, one per title (case-insensitive), first spelling kept, in order. */
export function extractLinks(body: string): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const match of body.matchAll(WIKILINK)) {
    const title = match[1].trim();
    if (title && !seen.has(title.toLowerCase())) {
      seen.add(title.toLowerCase());
      titles.push(title);
    }
  }
  return titles;
}

/** Rewrites [[from]] (any case, any inner spaces) to [[to]]. */
export function renameLinks(body: string, from: string, to: string): string {
  const wanted = from.trim().toLowerCase();
  return body.replace(WIKILINK, (whole, inner: string) => (inner.trim().toLowerCase() === wanted ? `[[${to}]]` : whole));
}

/** What each note links to (ids) and what it links to that no note has. Titles resolve within a note's own campaign. */
export function summarizeNotes(notes: readonly StoryNote[]): StorySummary[] {
  const byTitle = new Map(notes.map((note) => [key(note.campaignId, note.title), note.id]));
  return notes.map((note) => {
    const links: string[] = [];
    const missing: string[] = [];
    for (const title of extractLinks(note.body)) {
      const target = byTitle.get(key(note.campaignId, title));
      if (target === undefined) missing.push(title);
      else if (target !== note.id) links.push(target);
    }
    return { id: note.id, title: note.title, type: note.type, tags: note.tags, campaignId: note.campaignId, updatedAt: note.updatedAt, links, missing };
  });
}

/** The notes in the same campaign whose body links to `note`. */
export function backlinksOf(notes: readonly StoryNote[], note: StoryNote): { id: string; title: string }[] {
  const wanted = note.title.toLowerCase();
  return notes
    .filter((other) => other.id !== note.id && other.campaignId === note.campaignId && extractLinks(other.body).some((title) => title.toLowerCase() === wanted))
    .map((other) => ({ id: other.id, title: other.title }));
}

export const STARTER_NOTES: readonly { title: string; type: NoteType; body: string }[] = [
  {
    title: "Premise",
    type: "plot",
    body: "## The big picture\nWhat is the campaign about, in a few sentences? What do the players want, and what stands in the way?\n\n## Where it starts\nThe opening scene, and the first place the party goes. See [[Factions]] for who is pulling the strings and [[Secrets and clues]] for what is hidden.",
  },
  {
    title: "Factions",
    type: "faction",
    body: "## Who matters\nList each group with what it wants and what it fears. Give each its own note and link it here by writing its name in double square brackets.\n\nBack to the [[Premise]].",
  },
  {
    title: "Secrets and clues",
    type: "secret",
    body: "## What the players do not know yet\nFor each secret: what it is, who knows it, and the clues that point to it.\n\nTie it to the [[Premise]] and note which [[Session log]] revealed it.",
  },
  {
    title: "Session log",
    type: "session",
    body: "## What happened\nA short entry after each session: what the party did, what changed, and what to prepare next.\n\nSee the [[Premise]] for the bigger story.",
  },
];

export type Duplicate = "duplicate";
export type Limit = "limit";
export type Conflict = "conflict";

export class StoryRepo {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private campaignRows(campaign: ScopedSelection): Row[] {
    const scope = campaignClause(campaign);
    return this.db
      .prepare(`SELECT * FROM story_notes${scope.sql ? ` WHERE ${scope.sql}` : ""} ORDER BY title COLLATE NOCASE, id`)
      .all(...scope.args) as Row[];
  }

  list(campaign: ScopedSelection = null): StorySummary[] {
    return summarizeNotes(this.campaignRows(campaign).map(toNote));
  }

  get(id: string): StoryNote | null {
    if (!STORY_ID.test(id)) return null;
    const row = this.db.prepare("SELECT * FROM story_notes WHERE id = ?").get(id) as Row | undefined;
    return row ? toNote(row) : null;
  }

  /** The notes (same campaign) whose body links to this one. */
  backlinks(id: string): { id: string; title: string }[] {
    const note = this.get(id);
    return note ? backlinksOf(this.campaignRows(note.campaignId ?? "unassigned").map(toNote), note) : [];
  }

  create(input: StoryInput): StoryNote | Duplicate | Limit {
    const value = storyNoteSchema.parse(input);
    const campaignId = value.campaignId ?? null;
    const scope = campaignClause(campaignId ?? "unassigned");
    const { n } = this.db.prepare(`SELECT COUNT(*) AS n FROM story_notes WHERE ${scope.sql}`).get(...scope.args) as { n: number };
    if (Number(n) >= MAX_STORY_NOTES) return "limit";
    const id = this.newId();
    const at = this.now().toISOString();
    try {
      this.db
        .prepare("INSERT INTO story_notes (id, campaign_id, title, type, tags, body, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)")
        .run(id, campaignId, value.title, value.type, JSON.stringify(value.tags), value.body, at, at);
    } catch (error) {
      if (isUnique(error)) return "duplicate";
      throw error;
    }
    return this.get(id)!;
  }

  update(id: string, version: number, input: StoryInput): StoryNote | Conflict | Duplicate | null {
    const current = this.get(id);
    if (!current) return null;
    const value = storyNoteSchema.parse(input);
    const campaignId = value.campaignId === undefined ? current.campaignId : value.campaignId;
    const at = this.now().toISOString();
    try {
      return this.transaction(() => {
        const result = this.db
          .prepare("UPDATE story_notes SET title = ?, type = ?, tags = ?, body = ?, campaign_id = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
          .run(value.title, value.type, JSON.stringify(value.tags), value.body, campaignId, at, id, version);
        if (Number(result.changes) === 0) return "conflict";
        if (value.title !== current.title) {
          const scope = campaignClause(campaignId ?? "unassigned");
          const others = this.db.prepare(`SELECT id, body FROM story_notes WHERE ${scope.sql} AND id <> ?`).all(...scope.args, id) as { id: string; body: string }[];
          const save = this.db.prepare("UPDATE story_notes SET body = ?, version = version + 1, updated_at = ? WHERE id = ?");
          for (const other of others) {
            const body = renameLinks(other.body, current.title, value.title);
            if (body !== other.body) save.run(body, at, other.id);
          }
        }
        return this.get(id)!;
      });
    } catch (error) {
      if (isUnique(error)) return "duplicate";
      throw error;
    }
  }

  delete(id: string): boolean {
    return Number(this.db.prepare("DELETE FROM story_notes WHERE id = ?").run(id).changes) > 0;
  }

  /** Fills an empty campaign with the starter notes; does nothing if it has any. Returns how many were added. */
  seedStarter(campaignId: string | null): number {
    return this.transaction(() => {
      const scope = campaignClause(campaignId ?? "unassigned");
      const { n } = this.db.prepare(`SELECT COUNT(*) AS n FROM story_notes WHERE ${scope.sql}`).get(...scope.args) as { n: number };
      if (Number(n) > 0) return 0;
      const insert = this.db.prepare("INSERT INTO story_notes (id, campaign_id, title, type, tags, body, version, created_at, updated_at) VALUES (?, ?, ?, ?, '[]', ?, 1, ?, ?)");
      const at = this.now().toISOString();
      for (const starter of STARTER_NOTES) insert.run(this.newId(), campaignId, starter.title, starter.type, starter.body, at, at);
      return STARTER_NOTES.length;
    });
  }
}

function isUnique(error: unknown): boolean {
  // Duck-typed: under the test pool node:sqlite errors come from another realm, so instanceof Error fails.
  return /UNIQUE constraint failed/i.test(String((error as { message?: unknown } | null)?.message ?? error));
}
