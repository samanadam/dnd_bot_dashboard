import { describe, expect, it } from "vitest";
import { ago, characterIdFromPath, MAX_LOG, normalize, withLog, needsCheck, nextBackoff, portalOrigin, rollFromFrame, shouldPush, signature } from "@/extension/src/state";

describe("rollFromFrame", () => {
  const socket = "wss://game-log-api-live.dndbeyond.com/v1";
  const frame = (extra: Record<string, unknown> = {}) => JSON.stringify({ id: "m1", entityId: "173706203", eventType: "dice/roll/fulfilled", data: { action: "Dagger: to hit" }, ...extra });

  it("returns the message of a finished roll that the page sends to the game log", () => {
    expect(rollFromFrame(socket, frame())).toMatchObject({ id: "m1", eventType: "dice/roll/fulfilled" });
  });

  it("ignores other sockets, other events, bad json and binary frames", () => {
    expect(rollFromFrame("wss://example.com/v1", frame())).toBeNull();
    expect(rollFromFrame(socket, frame({ eventType: "dice/roll/pending" }))).toBeNull();
    expect(rollFromFrame(socket, "not json")).toBeNull();
    expect(rollFromFrame(socket, "null")).toBeNull();
    expect(rollFromFrame(socket, new ArrayBuffer(4))).toBeNull();
  });
});

describe("extension state helpers", () => {
  it("pushes only when the character changed", () => {
    expect(shouldPush(null, "a")).toBe(true);
    expect(shouldPush("a", "a")).toBe(false);
    expect(shouldPush("a", "b")).toBe(true);
  });

  it("backs off from 15 seconds, doubling, up to 5 minutes", () => {
    expect(nextBackoff(0)).toBe(15_000);
    expect(nextBackoff(1)).toBe(30_000);
    expect(nextBackoff(3)).toBe(120_000);
    expect(nextBackoff(10)).toBe(300_000);
  });

  it("signs the same data the same way and different data differently", () => {
    expect(signature('{"a":1}')).toBe(signature('{"a":1}'));
    expect(signature('{"a":1}')).not.toBe(signature('{"a":2}'));
  });

  it("reads the character id from a D&D Beyond character path", () => {
    expect(characterIdFromPath("/characters/150752285")).toBe("150752285");
    expect(characterIdFromPath("/characters/150752285/builder")).toBe("150752285");
    expect(characterIdFromPath("/characters/builder")).toBeNull();
    expect(characterIdFromPath("/profile")).toBeNull();
  });

  it("re-checks the pairing every five minutes, even when nothing changed", () => {
    expect(needsCheck(null, 1_000)).toBe(true);
    expect(needsCheck(1_000, 1_000 + 299_999)).toBe(false);
    expect(needsCheck(1_000, 1_000 + 300_000)).toBe(true);
  });

  it("accepts https portals and localhost, and nothing else", () => {
    expect(portalOrigin("https://portal.example.com/settings")).toBe("https://portal.example.com");
    expect(portalOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(portalOrigin("http://portal.example.com")).toBeNull();
    expect(portalOrigin("javascript:alert(1)")).toBeNull();
    expect(portalOrigin("not a url")).toBeNull();
  });
});

describe("normalize", () => {
  it("fills every field for state saved by an older version", () => {
    const state = normalize({ portalUrl: "https://p.example", token: "ptx_x", characters: { "1": { lastSyncAt: "2026-11-25T10:00:00.000Z", lastError: null, enabled: false } as never } });
    expect(state.settings).toEqual({ live: false, autoStart: false, intervalSeconds: 30, replayRolls: true, overlay: true });
    expect(state.log).toEqual([]);
    expect(state.characters["1"]).toEqual({ lastSyncAt: "2026-11-25T10:00:00.000Z", lastError: null, enabled: false, name: null, sheetId: null, needsCampaign: false, campaignId: null, summary: "", avatarUrl: null, hp: null, maxHp: null });
  });

  it("starts empty and keeps stored settings over the defaults", () => {
    expect(normalize(undefined).characters).toEqual({});
    expect(normalize({ settings: { intervalSeconds: 120, replayRolls: false } as never }).settings).toEqual({ live: false, autoStart: false, intervalSeconds: 120, replayRolls: false, overlay: true });
  });
});

describe("withLog and ago", () => {
  it("keeps the newest lines and no more than the limit", () => {
    let log: ReturnType<typeof withLog> = [];
    for (let i = 0; i < MAX_LOG + 5; i++) log = withLog(log, "n" + i, false, "2026-11-25T10:00:00.000Z");
    expect(log).toHaveLength(MAX_LOG);
    expect(log.at(-1)?.text).toBe("n" + (MAX_LOG + 4));
  });

  it("says how long ago in short words", () => {
    const now = Date.parse("2026-11-25T12:00:00.000Z");
    expect(ago(null, now)).toBe("never");
    expect(ago("2026-11-25T11:59:58.000Z", now)).toBe("just now");
    expect(ago("2026-11-25T11:59:30.000Z", now)).toBe("30 s ago");
    expect(ago("2026-11-25T11:57:00.000Z", now)).toBe("3 min ago");
    expect(ago("2026-11-25T09:00:00.000Z", now)).toBe("3 h ago");
    expect(ago("2026-11-23T12:00:00.000Z", now)).toBe("2 d ago");
  });
});
