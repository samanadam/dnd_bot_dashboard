import { describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/dm/db";
import { SceneRepo, sceneSchema } from "@/lib/dm/scenes";

const LINK = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

const scene = (layers: unknown[]) => ({ name: "Storm", category: "Weather", replace: true, music: null, layers });
const layer = (over: Record<string, unknown> = {}) => ({ kind: "ambience", id: LINK, title: "Thunder", volume: 1, source: "youtube", ...over });

describe("scene layers from YouTube", () => {
  it("accepts a YouTube layer that holds the exact watch link", () => {
    expect(sceneSchema.safeParse(scene([layer()])).success).toBe(true);
  });

  it("still accepts a bucket layer with no source, or with r2", () => {
    const bucket = { kind: "sfx", id: "music/sfx/door.ogg", title: "Door", volume: 1 };
    expect(sceneSchema.safeParse(scene([bucket])).success).toBe(true);
    expect(sceneSchema.safeParse(scene([{ ...bucket, source: "r2" }])).success).toBe(true);
  });

  it.each([
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxyz",
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://evil.example/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/playlist?list=PLxyz",
    "dQw4w9WgXcQ",
    "music/sfx/door.ogg",
    "--exec=touch x",
  ])("refuses %j as a YouTube layer id", (id) => {
    expect(sceneSchema.safeParse(scene([layer({ id })])).success).toBe(false);
  });

  it("refuses an unknown source and stray fields", () => {
    expect(sceneSchema.safeParse(scene([layer({ source: "spotify" })])).success).toBe(false);
    expect(sceneSchema.safeParse(scene([layer({ extra: 1 })])).success).toBe(false);
  });

  it("keeps the source through the database, and reads scenes saved before it existed", () => {
    const db = openDatabase(":memory:");
    const repo = new SceneRepo(db);
    const created = repo.create(sceneSchema.parse(scene([layer(), { kind: "sfx", id: "music/sfx/door.ogg", title: "Door", volume: 1 }])))!;
    const read = repo.get(created.id)!;
    expect(read.layers.map((item) => item.source)).toEqual(["youtube", undefined]);

    // A row written by an older build has no source at all.
    const old = JSON.stringify({ replace: true, music: null, layers: [{ kind: "sfx", id: "music/sfx/door.ogg", title: "Door", volume: 1 }] });
    db.prepare("UPDATE scenes SET data = ? WHERE id = ?").run(old, created.id);
    expect(repo.get(created.id)?.layers).toEqual([{ kind: "sfx", id: "music/sfx/door.ogg", title: "Door", volume: 1 }]);
  });

  it("does not return a stored scene whose YouTube layer was tampered with", () => {
    const db = openDatabase(":memory:");
    const repo = new SceneRepo(db);
    const created = repo.create(sceneSchema.parse(scene([layer()])))!;
    const evil = JSON.stringify({ replace: true, music: null, layers: [layer({ id: "https://evil.example/x" })] });
    db.prepare("UPDATE scenes SET data = ? WHERE id = ?").run(evil, created.id);
    expect(repo.get(created.id)).toBeNull();
    expect(repo.list()).toEqual([]);
  });
});
