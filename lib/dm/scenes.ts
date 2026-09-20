import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { campaignClause, campaignIdSchema, type Selection } from "@/lib/campaign/selection";
import { isTrackLink, isWebSource, WEB_SOURCES } from "@/lib/webAudio";

// A scene is a saved arrangement of sound: optionally a music track, plus
// looping ambience and one-shot effects. The portal stores it; playing it is the
// browser calling the bot ordinary music and soundboard endpoints, one step at
// a time, so every step still passes the proxy allowlist and rate limits.

// Same rule as the proxy allowlist track id: no control characters.
const trackId = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[^\x00-\x1f\x7f]+$/, "invalid track id");
const title = z.string().trim().min(1).max(200);
const volume = z.number().min(0).max(2);

export const MAX_LAYERS = 12;
export const MAX_SCENES = 200;

// A layer with no source is a sound from the bucket, as every scene saved before
// web sounds existed. A YouTube or SoundCloud layer must hold the exact link the
// bot accepts for that source, so a stored scene cannot smuggle any other URL
// into a later bot call.
const layerSchema = z
  .object({ kind: z.enum(["ambience", "sfx"]), id: trackId, title, volume, source: z.enum(["r2", ...WEB_SOURCES]).optional() })
  .strict()
  .refine((layer) => !isWebSource(layer.source) || isTrackLink(layer.source, layer.id), {
    path: ["id"],
    message: "must be a plain link for that source",
  });

export const sceneSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    // Free text; scenes with the same category are grouped. Empty means none.
    category: z.string().trim().max(40),
    // Stop the sounds already playing before this scene starts.
    replace: z.boolean(),
    music: z
      .object({ source: z.enum(["r2", ...WEB_SOURCES]), id: trackId, title, volume: volume.nullable() })
      .strict()
      .nullable(),
    layers: z.array(layerSchema).max(MAX_LAYERS),
    // Left out on an update it is unchanged; null files the scene under no campaign.
    campaignId: campaignIdSchema.nullable().optional(),
  })
  .strict();

export type SceneInput = z.infer<typeof sceneSchema>;
export type Scene = Omit<SceneInput, "campaignId"> & {
  id: string;
  campaignId: string | null;
  createdAt: string;
  updatedAt: string;
};

export const SCENE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Row = {
  id: string;
  name: string;
  category: string;
  campaign_id: string | null;
  data: string;
  created_at: string;
  updated_at: string;
};

const storedSchema = sceneSchema.pick({ replace: true, music: true, layers: true });

export class SceneRepo {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  // Validated again on the way out, so a damaged row never reaches a page.
  private toScene(row: Row | undefined): Scene | null {
    if (!row) return null;
    try {
      const data = storedSchema.safeParse(JSON.parse(row.data));
      if (!data.success) return null;
      return {
        id: row.id,
        name: row.name,
        category: row.category,
        campaignId: row.campaign_id,
        ...data.data,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch {
      return null;
    }
  }

  list(campaign: Selection = null): Scene[] {
    const scope = campaignClause(campaign);
    const rows = this.db
      .prepare(
        `SELECT * FROM scenes${scope.sql ? ` WHERE ${scope.sql}` : ""} ORDER BY category COLLATE NOCASE, name COLLATE NOCASE, id`,
      )
      .all(...scope.args) as Row[];
    return rows.map((row) => this.toScene(row)).filter((scene): scene is Scene => scene !== null);
  }

  count(): number {
    return Number((this.db.prepare("SELECT COUNT(*) AS n FROM scenes").get() as { n: number }).n);
  }

  get(id: string): Scene | null {
    if (!SCENE_ID.test(id)) return null;
    return this.toScene(this.db.prepare("SELECT * FROM scenes WHERE id = ?").get(id) as Row | undefined);
  }

  /** Returns null when the scene limit is reached. */
  create(input: SceneInput): Scene | null {
    if (this.count() >= MAX_SCENES) return null;
    const value = sceneSchema.parse(input);
    const id = this.newId();
    const at = this.now().toISOString();
    const { name, category, campaignId, ...data } = value;
    this.db
      .prepare("INSERT INTO scenes (id, name, category, campaign_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, name, category, campaignId ?? null, JSON.stringify(data), at, at);
    return { id, name, category, ...data, campaignId: campaignId ?? null, createdAt: at, updatedAt: at };
  }

  update(id: string, input: SceneInput): Scene | null {
    if (!SCENE_ID.test(id)) return null;
    const value = sceneSchema.parse(input);
    const { name, category, campaignId, ...data } = value;
    const at = this.now().toISOString();
    const result =
      campaignId === undefined
        ? this.db
            .prepare("UPDATE scenes SET name = ?, category = ?, data = ?, updated_at = ? WHERE id = ?")
            .run(name, category, JSON.stringify(data), at, id)
        : this.db
            .prepare("UPDATE scenes SET name = ?, category = ?, campaign_id = ?, data = ?, updated_at = ? WHERE id = ?")
            .run(name, category, campaignId, JSON.stringify(data), at, id);
    return Number(result.changes) > 0 ? this.get(id) : null;
  }

  remove(id: string): boolean {
    if (!SCENE_ID.test(id)) return false;
    return Number(this.db.prepare("DELETE FROM scenes WHERE id = ?").run(id).changes) > 0;
  }
}
