import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bot } from "@/lib/bot/client";
import { handleBotRequest, ReadCache, type ProxyDeps } from "@/lib/bot/proxy";
import { resetDemo } from "@/lib/demo/store";
import { openDatabase } from "@/lib/dm/db";
import { SavedRepo, savedSchema } from "@/lib/dm/saved";
import { sceneSchema } from "@/lib/dm/scenes";
import { RateLimiter } from "@/lib/rateLimit";
import { isSoundCloudSetLink, isSoundCloudSetRef, parseSoundCloudLink, parseSoundCloudSetLink, soundcloudSetUrl } from "@/lib/soundcloud";
import { detectLink, isRef, isSetLink, isSetRef, isTrackLink, trackUrl } from "@/lib/webAudio";

// SoundCloud albums and playlists ("sets"). A set has exactly one link form,
// is only ever music, and has its own two bot calls; every other path still
// refuses one.

const SET = "https://soundcloud.com/wolfbravery/sets/tavern-nights";
const SET_REF = "wolfbravery/sets/tavern-nights";
const TRACK = "https://soundcloud.com/wolfbravery/tavern-ambience";

describe("SoundCloud set links", () => {
  it.each([
    [SET, SET_REF],
    ["https://www.soundcloud.com/WolfBravery/sets/Tavern-Nights", SET_REF],
    ["https://m.soundcloud.com/wolfbravery/sets/tavern-nights?si=abc#t=1", SET_REF],
    ["http://soundcloud.com/a_b/sets/c-d/", "a_b/sets/c-d"],
  ])("reduces %j to artist/sets/name", (input, expected) => {
    expect(parseSoundCloudSetLink(input)).toBe(expected);
  });

  it.each([
    TRACK,
    "https://soundcloud.com/a/sets",
    "https://soundcloud.com/a/sets/b/s-SECRETTOKEN",
    "https://soundcloud.com/discover/sets/weekly",
    "https://soundcloud.com/a/albums",
    `https://soundcloud.com/a/sets/${"b".repeat(116)}`,
    "https://soundcloud.com.evil.example/a/sets/b",
    "https://user:pw@soundcloud.com/a/sets/b",
    "https://soundcloud.com:8443/a/sets/b",
    "https://on.soundcloud.com/AbCdEf",
    "javascript:alert(1)",
    "",
  ])("refuses %j", (input) => {
    expect(parseSoundCloudSetLink(input)).toBeNull();
  });

  it("is never a track, and a track is never a set", () => {
    expect(parseSoundCloudLink(SET)).toBeNull();
    expect(parseSoundCloudSetLink(TRACK)).toBeNull();
    expect(isTrackLink("soundcloud", SET)).toBe(false);
    expect(isSetLink(TRACK)).toBe(false);
  });

  it("rebuilds one link from a clean reference", () => {
    expect(isSoundCloudSetRef(SET_REF)).toBe(true);
    expect(soundcloudSetUrl(SET_REF)).toBe(SET);
    expect(isSoundCloudSetLink(SET)).toBe(true);
    for (const bad of [`${SET}/`, `${SET}?a=1`, "https://www.soundcloud.com/wolfbravery/sets/tavern-nights", "https://soundcloud.com/WolfBravery/sets/x"]) {
      expect(isSoundCloudSetLink(bad)).toBe(false);
    }
    for (const bad of ["a/sets", "A/sets/b", "a/sets/b/c", "sets/sets/b", "a/b"]) {
      expect(isSoundCloudSetRef(bad)).toBe(false);
      expect(() => soundcloudSetUrl(bad)).toThrow();
    }
  });

  it("fits what the saved-links table can hold", () => {
    expect(`${"a".repeat(120)}/sets/${"b".repeat(115)}`).toHaveLength(241);
    expect(isSoundCloudSetRef(`${"a".repeat(120)}/sets/${"b".repeat(115)}`)).toBe(true);
  });
});

describe("sets among the web sources", () => {
  it("tells a pasted set from a pasted track", () => {
    expect(detectLink(SET)).toEqual({ source: "soundcloud", ref: SET_REF, set: true });
    expect(detectLink(TRACK)).toEqual({ source: "soundcloud", ref: "wolfbravery/tavern-ambience", set: false });
  });

  it("accepts a set reference only as music", () => {
    expect(isRef("soundcloud", SET_REF, "music")).toBe(true);
    expect(isRef("soundcloud", SET_REF, "ambience")).toBe(false);
    expect(isRef("soundcloud", SET_REF, "sfx")).toBe(false);
    expect(isRef("soundcloud", SET_REF)).toBe(false);
    expect(isRef("youtube", SET_REF, "music")).toBe(false);
    expect(isSetRef("soundcloud", SET_REF)).toBe(true);
    expect(isSetRef("youtube", SET_REF)).toBe(false);
    expect(trackUrl("soundcloud", SET_REF)).toBe(SET);
  });
});

const savedSet = (over: Record<string, unknown> = {}) => ({
  source: "soundcloud",
  kind: "music",
  ref: SET_REF,
  title: "Tavern Nights",
  durationSeconds: 3600,
  ...over,
});

describe("saving a set", () => {
  it("is music only", () => {
    expect(savedSchema.safeParse(savedSet()).success).toBe(true);
    expect(savedSchema.safeParse(savedSet({ kind: "ambience" })).success).toBe(false);
    expect(savedSchema.safeParse(savedSet({ kind: "sfx" })).success).toBe(false);
    expect(savedSchema.safeParse(savedSet({ source: "youtube" })).success).toBe(false);
    expect(savedSchema.safeParse(savedSet({ ref: "wolfbravery/sets/x/s-token" })).success).toBe(false);
  });

  it("is stored as its reference and read back", () => {
    const repo = new SavedRepo(openDatabase(":memory:"));
    const created = repo.create(savedSchema.parse(savedSet()));
    expect(created.ok && created.item).toMatchObject({ source: "soundcloud", kind: "music", ref: SET_REF });
    expect(repo.list()).toHaveLength(1);
  });
});

const scene = (music: Record<string, unknown> | null) => ({ name: "Tavern", category: "", replace: true, music, layers: [] });

describe("a set as a scene's music", () => {
  it("takes the set link and an optional shuffle", () => {
    expect(sceneSchema.safeParse(scene({ source: "soundcloud", id: SET, title: "Tavern Nights", volume: null, shuffle: true })).success).toBe(true);
    // Scenes saved before sets have no shuffle and still read.
    expect(sceneSchema.safeParse(scene({ source: "r2", id: "music/tavern.opus", title: "Tavern", volume: 0.5 })).success).toBe(true);
  });

  it("refuses a set under another source, or a set link in any other form", () => {
    for (const music of [
      { source: "youtube", id: SET, title: "x", volume: null },
      { source: "r2", id: SET, title: "x", volume: null },
      { source: "soundcloud", id: "https://soundcloud.com/a/sets/b/s-token", title: "x", volume: null },
      { source: "soundcloud", id: "https://www.soundcloud.com/a/sets/b", title: "x", volume: null },
      { source: "soundcloud", id: SET, title: "x", volume: null, shuffle: "yes" },
    ]) {
      expect(sceneSchema.safeParse(scene(music)).success).toBe(false);
    }
  });
});

describe("the proxy and sets", () => {
  function deps(): ProxyDeps & { fetchImpl: ReturnType<typeof vi.fn> } {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true }));
    return {
      getUserId: async () => "42",
      botUrl: "https://bot.example/api/v1",
      botToken: "test-token-abcdefghijklmnop",
      fetchImpl,
      limiter: new RateLimiter(),
      cache: new ReadCache(),
    } as ProxyDeps & { fetchImpl: ReturnType<typeof vi.fn> };
  }

  const post = (path: string, body: unknown, d = deps()) =>
    handleBotRequest(
      new Request(`https://portal.example/api/bot/${path}`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "x-portal-request": "1", "sec-fetch-site": "same-origin", "content-type": "application/json" },
      }),
      path.split("/"),
      d,
    );

  it("forwards a set listing and a set play with the exact link", async () => {
    const d = deps();
    expect((await post("music/set", { source: "soundcloud", id: SET }, d)).status).toBe(200);
    expect((await post("music/play-set", { source: "soundcloud", id: SET, position: "now", shuffle: true, channel_id: "123456789012345678" }, d)).status).toBe(200);
    expect(d.fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(d.fetchImpl.mock.calls[1][0])).toBe("https://bot.example/api/v1/music/play-set");
  });

  it.each([
    ["music/set", { source: "soundcloud", id: TRACK }],
    ["music/set", { source: "youtube", id: SET }],
    ["music/set", { source: "soundcloud", id: "https://soundcloud.com/a/sets/b/s-token" }],
    ["music/set", { source: "soundcloud", id: "https://www.soundcloud.com/wolfbravery/sets/tavern-nights" }],
    ["music/play-set", { source: "soundcloud", id: SET, shuffle: "yes" }],
    ["music/play-set", { source: "soundcloud", id: SET, position: "middle" }],
    ["music/play-set", { source: "soundcloud", id: SET, extra: 1 }],
    // Every other call still refuses a set.
    ["music/play", { source: "soundcloud", id: SET }],
    ["music/play", { source: "soundcloud", id: "https://m.soundcloud.com/a/sets/b?x=1" }],
    ["soundboard/play", { kind: "ambience", id: SET, source: "soundcloud" }],
    ["soundboard/prepare", { kind: "sfx", id: SET, source: "soundcloud" }],
  ])("refuses %s %j", async (path, body) => {
    const d = deps();
    const status = (await post(path, body, d)).status;
    expect([400, 404]).toContain(status);
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });

  it("still plays a library file that happens to sit in a folder called sets", async () => {
    const d = deps();
    expect((await post("music/play", { source: "r2", id: "music/sets/battle.opus" }, d)).status).toBe(200);
  });
});

describe("sets in the demo", () => {
  beforeEach(() => {
    resetDemo();
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      location: { pathname: "/demo/bot/music", protocol: "https:" },
      localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => void storage.set(key, value) },
    });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ real: true })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lists a set and queues it behind its first track", async () => {
    const listing = await bot.setTracks(SET);
    expect(listing.title).toBe("Tavern nights");
    expect(listing.tracks.length).toBeGreaterThan(1);
    const result = await bot.playSet({ id: SET, position: "now", channel_id: "123456789012345678" });
    expect(result.queued).toBe(listing.tracks.length);
    expect(result.current?.id).toBe(listing.tracks[0].id);
    // Right behind the first, ahead of anything already queued.
    const rest = listing.tracks.slice(1).map((track) => track.id);
    expect(result.queue.slice(0, rest.length).map((track) => track.id)).toEqual(rest);
    expect(fetch).not.toHaveBeenCalled();
  });
});
