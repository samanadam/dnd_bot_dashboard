import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase, SCHEMA_VERSION } from "@/lib/dm/db";
import { SavedRepo, savedSchema } from "@/lib/dm/saved";
import { SceneRepo, sceneSchema } from "@/lib/dm/scenes";
import { isSoundCloudRef, parseSoundCloudLink, soundcloudUrl } from "@/lib/soundcloud";
import { detectLink, isRef, isTrackLink, parseLink, refFromTrack, sourceLabel, trackUrl } from "@/lib/webAudio";

const LINK = "https://soundcloud.com/wolfbravery/tavern-ambience";
const REF = "wolfbravery/tavern-ambience";

describe("SoundCloud links", () => {
  it.each([
    [LINK, REF],
    ["https://www.soundcloud.com/WolfBravery/Tavern-Ambience", REF],
    ["https://m.soundcloud.com/wolfbravery/tavern-ambience?si=abc&utm_source=x#t=10", REF],
    ["http://soundcloud.com/a_b/c-d", "a_b/c-d"],
    ["  https://soundcloud.com/a/b  ", "a/b"],
  ])("reduces %j to its artist/track path", (input, expected) => {
    expect(parseSoundCloudLink(input)).toBe(expected);
  });

  it.each([
    "https://soundcloud.com/a",
    "https://soundcloud.com/a/b/c",
    "https://soundcloud.com/a/sets/mix",
    "https://soundcloud.com/a/likes",
    "https://soundcloud.com/a/tracks",
    "https://soundcloud.com/discover/weekly",
    "https://soundcloud.com/a/b/s-SECRETTOKEN",
    "https://soundcloud.com/a b/c",
    "https://soundcloud.com/../a",
    "https://soundcloud.com.evil.example/a/b",
    "https://evil.example/soundcloud.com/a/b",
    "https://user:pw@soundcloud.com/a/b",
    "https://soundcloud.com:8443/a/b",
    "https://on.soundcloud.com/AbCdEf",
    "https://api.soundcloud.com/tracks/123",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "ftp://soundcloud.com/a/b",
    "javascript:alert(1)",
    `https://soundcloud.com/${"a".repeat(121)}/b`,
    `https://soundcloud.com/a/${"b".repeat(600)}`,
    "wolfbravery/tavern-ambience",
    "",
  ])("refuses %j", (input) => {
    expect(parseSoundCloudLink(input)).toBeNull();
  });

  it("only accepts a clean lower-case reference and rebuilds one URL from it", () => {
    expect(isSoundCloudRef(REF)).toBe(true);
    expect(soundcloudUrl(REF)).toBe(LINK);
    for (const bad of ["A/b", "a/b/c", "a", "a/sets", "a/b?x=1", "../a", "a/b\n", " a/b", "http://a/b", "a/b#x", "", "/"]) {
      expect(isSoundCloudRef(bad)).toBe(false);
      expect(() => soundcloudUrl(bad)).toThrow();
    }
  });
});

describe("web sources together", () => {
  const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

  it("tells which service a pasted link belongs to", () => {
    expect(detectLink(YT)).toEqual({ source: "youtube", ref: "dQw4w9WgXcQ" });
    expect(detectLink("https://youtu.be/dQw4w9WgXcQ?t=4")).toEqual({ source: "youtube", ref: "dQw4w9WgXcQ" });
    expect(detectLink(LINK)).toEqual({ source: "soundcloud", ref: REF });
    expect(detectLink("tavern music")).toBeNull();
    expect(detectLink("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  it("does not read one service's link as the other's", () => {
    expect(parseLink("youtube", LINK)).toBeNull();
    expect(parseLink("soundcloud", YT)).toBeNull();
    expect(isRef("youtube", REF)).toBe(false);
    expect(isRef("soundcloud", "dQw4w9WgXcQ")).toBe(false);
    expect(isTrackLink("youtube", LINK)).toBe(false);
    expect(isTrackLink("soundcloud", YT)).toBe(false);
  });

  it("builds and recognises exactly one link form per service", () => {
    expect(trackUrl("youtube", "dQw4w9WgXcQ")).toBe(YT);
    expect(trackUrl("soundcloud", REF)).toBe(LINK);
    expect(isTrackLink("youtube", YT)).toBe(true);
    expect(isTrackLink("soundcloud", LINK)).toBe(true);
    for (const bad of [`${LINK}/`, `${LINK}?a=1`, "https://www.soundcloud.com/wolfbravery/tavern-ambience", "https://soundcloud.com/wolfbravery/sets", "https://soundcloud.com/WolfBravery/tavern-ambience"]) {
      expect(isTrackLink("soundcloud", bad)).toBe(false);
    }
  });

  it("finds the reference in what the bot returns", () => {
    expect(refFromTrack("youtube", "dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(refFromTrack("youtube", YT)).toBe("dQw4w9WgXcQ");
    expect(refFromTrack("soundcloud", LINK)).toBe(REF);
    // A bare 11-character string is only a YouTube id; it is not a SoundCloud track.
    expect(refFromTrack("soundcloud", "dQw4w9WgXcQ")).toBeNull();
    expect(refFromTrack("soundcloud", "https://api.soundcloud.com/tracks/1")).toBeNull();
  });

  it("labels every source the bot can report", () => {
    expect([sourceLabel("r2"), sourceLabel("youtube"), sourceLabel("soundcloud")]).toEqual(["Library", "YouTube", "SoundCloud"]);
  });
});

const item = (over: Record<string, unknown> = {}) => ({
  source: "soundcloud",
  kind: "ambience",
  ref: REF,
  title: "Tavern Ambience",
  durationSeconds: 700,
  category: "Taverns",
  ...over,
});

describe("saving SoundCloud tracks", () => {
  it("accepts a track and refuses a reference that does not fit its source", () => {
    expect(savedSchema.safeParse(item()).success).toBe(true);
    for (const over of [
      { ref: "dQw4w9WgXcQ" },
      { ref: LINK },
      { ref: "a/sets" },
      { ref: "A/b" },
      { source: "youtube" },
      { source: "spotify" },
      { source: undefined },
    ]) {
      expect(savedSchema.safeParse(item(over)).success).toBe(false);
    }
    expect(savedSchema.safeParse(item({ source: "youtube", ref: "dQw4w9WgXcQ" })).success).toBe(true);
  });

  it("keeps the reference and no link, and reads it back", () => {
    const db = openDatabase(":memory:");
    const repo = new SavedRepo(db);
    const created = repo.create(savedSchema.parse(item()));
    expect(created.ok && created.item).toMatchObject({ source: "soundcloud", ref: REF });
    const row = db.prepare("SELECT * FROM saved_tracks").get() as Record<string, unknown>;
    expect(row).toMatchObject({ source: "soundcloud", ref: REF });
    expect(JSON.stringify(row)).not.toMatch(/https?:|soundcloud\.com/);
  });

  it("keeps one row per service, kind and campaign", () => {
    const repo = new SavedRepo(openDatabase(":memory:"));
    expect(repo.create(savedSchema.parse(item())).ok).toBe(true);
    expect(repo.create(savedSchema.parse(item()))).toEqual({ ok: false, reason: "duplicate" });
    expect(repo.create(savedSchema.parse(item({ kind: "sfx" }))).ok).toBe(true);
    // Same characters, other service: a different item.
    expect(repo.create(savedSchema.parse(item({ source: "youtube", ref: "abcdefghijk" }))).ok).toBe(true);
    expect(repo.list()).toHaveLength(3);
  });

  it("does not return a damaged row", () => {
    const db = openDatabase(":memory:");
    const repo = new SavedRepo(db);
    const created = repo.create(savedSchema.parse(item()));
    if (!created.ok) throw new Error("setup");
    db.prepare("UPDATE saved_tracks SET ref = ? WHERE id = ?").run("evil/sets", created.item.id);
    expect(repo.list()).toEqual([]);
  });

  it("is held to the same rules by the database itself", () => {
    const db = openDatabase(":memory:");
    const insert = (source: string, ref: string) =>
      db
        .prepare("INSERT INTO saved_tracks (id, source, kind, ref, title, created_at, updated_at) VALUES (?, ?, 'music', ?, 't', 'x', 'x')")
        .run(crypto.randomUUID(), source, ref);
    expect(() => insert("youtube", "short")).toThrow();
    expect(() => insert("soundcloud", "ab")).toThrow();
    expect(() => insert("soundcloud", "x".repeat(242))).toThrow();
    expect(() => insert("spotify", "dQw4w9WgXcQ")).toThrow();
    expect(() => insert("soundcloud", REF)).not.toThrow();
  });
});

describe("upgrading a database that only holds YouTube links", () => {
  it("keeps every row as YouTube and enforces the new rules afterwards", () => {
    const dir = mkdtempSync(join(tmpdir(), "portal-saved-"));
    const file = join(dir, "dm.sqlite");
    try {
      // The table as migration 6 left it, at schema version 6.
      const old = new DatabaseSync(file);
      old.exec(`CREATE TABLE saved_tracks (
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
      CREATE INDEX saved_tracks_campaign ON saved_tracks (campaign_id);`);
      const insert = old.prepare("INSERT INTO saved_tracks VALUES (?, ?, ?, ?, ?, ?, ?, 'a', 'b')");
      insert.run("11111111-1111-4111-8111-111111111111", "music", "dQw4w9WgXcQ", "Never", 213, "Classics", null);
      insert.run("22222222-2222-4222-8222-222222222222", "sfx", "abcdefghijk", "Door", 4, "", "0123456789ab");
      old.exec("PRAGMA user_version = 6");
      old.close();

      const db = openDatabase(file);
      expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(SCHEMA_VERSION);
      const repo = new SavedRepo(db);
      expect(repo.list().map((row) => [row.source, row.kind, row.ref, row.title, row.category, row.campaignId, row.durationSeconds])).toEqual([
        ["youtube", "music", "dQw4w9WgXcQ", "Never", "Classics", null, 213],
        ["youtube", "sfx", "abcdefghijk", "Door", "", "0123456789ab", 4],
      ]);
      // The unique index came across, and a SoundCloud track can now be added.
      expect(repo.create(savedSchema.parse(item({ source: "youtube", kind: "music", ref: "dQw4w9WgXcQ", campaignId: null })))).toEqual({ ok: false, reason: "duplicate" });
      expect(repo.create(savedSchema.parse(item())).ok).toBe(true);
      expect(() => db.prepare("SELECT video_id FROM saved_tracks").all()).toThrow();
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("scenes with SoundCloud layers", () => {
  const scene = (layers: unknown[], music: unknown = null) => ({ name: "Rainy tavern", category: "Taverns", replace: true, music, layers });
  const layer = (over: Record<string, unknown> = {}) => ({ kind: "ambience", id: LINK, title: "Tavern", volume: 1, source: "soundcloud", ...over });

  it("accepts an exact SoundCloud link for a SoundCloud layer", () => {
    expect(sceneSchema.safeParse(scene([layer()])).success).toBe(true);
    expect(sceneSchema.safeParse(scene([], { source: "soundcloud", id: LINK, title: "Tavern", volume: null })).success).toBe(true);
  });

  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://soundcloud.com/a/sets/mix",
    `${LINK}?in=x`,
    "https://soundcloud.com/WolfBravery/tavern-ambience",
    "http://soundcloud.com/wolfbravery/tavern-ambience",
    REF,
    "--exec=touch x",
  ])("refuses %j as a SoundCloud layer id", (id) => {
    expect(sceneSchema.safeParse(scene([layer({ id })])).success).toBe(false);
  });

  it("refuses a YouTube layer that holds a SoundCloud link", () => {
    expect(sceneSchema.safeParse(scene([layer({ source: "youtube" })])).success).toBe(false);
  });

  it("does not return a stored scene whose SoundCloud layer was tampered with", () => {
    const db = openDatabase(":memory:");
    const repo = new SceneRepo(db);
    const created = repo.create(sceneSchema.parse(scene([layer()])))!;
    const evil = JSON.stringify({ replace: true, music: null, layers: [layer({ id: "https://evil.example/a/b" })] });
    db.prepare("UPDATE scenes SET data = ? WHERE id = ?").run(evil, created.id);
    expect(repo.get(created.id)).toBeNull();
  });
});
