import { describe, expect, it } from "vitest";
import { EXT_SOURCE, originAllowed, PAGE_SOURCE, parseExtMessage, parsePageMessage } from "@/extension/src/bridge";
import { characterSummary, duration, normalize, withRoll, MAX_ROLLS } from "@/extension/src/state";

const token = "ptx_" + "a".repeat(43);

describe("parsePageMessage (portal page to extension)", () => {
  it("reads a hello and a pair with a well-formed token", () => {
    expect(parsePageMessage({ source: PAGE_SOURCE, type: "hello" })).toEqual({ type: "hello" });
    expect(parsePageMessage({ source: PAGE_SOURCE, type: "pair", token })).toEqual({ type: "pair", token });
  });

  it("ignores other sources, unknown types and bad tokens", () => {
    expect(parsePageMessage({ source: "someone", type: "hello" })).toBeNull();
    expect(parsePageMessage({ source: PAGE_SOURCE, type: "steal" })).toBeNull();
    expect(parsePageMessage({ source: PAGE_SOURCE, type: "pair", token: "nope" })).toBeNull();
    expect(parsePageMessage({ source: PAGE_SOURCE, type: "pair", token: token + "<script>" })).toBeNull();
    expect(parsePageMessage(null)).toBeNull();
    expect(parsePageMessage("hello")).toBeNull();
  });
});

describe("parseExtMessage (extension to portal page)", () => {
  it("reads present and paired answers", () => {
    expect(parseExtMessage({ source: EXT_SOURCE, type: "present", version: "0.3.0", paired: true, live: false })).toEqual({ type: "present", version: "0.3.0", paired: true, live: false });
    expect(parseExtMessage({ source: EXT_SOURCE, type: "paired", ok: true, text: "Paired as Aria." })).toEqual({ type: "paired", ok: true, text: "Paired as Aria." });
  });

  it("ignores anything else, and never passes extra fields on", () => {
    expect(parseExtMessage({ source: PAGE_SOURCE, type: "present" })).toBeNull();
    expect(parseExtMessage({ source: EXT_SOURCE, type: "present", version: 5 })).toBeNull();
    expect(parseExtMessage({ source: EXT_SOURCE, type: "paired", ok: "yes" })).toBeNull();
    expect(parseExtMessage({ source: EXT_SOURCE, type: "present", version: "1", paired: false, live: true, token })).toEqual({ type: "present", version: "1", paired: false, live: true });
  });
});

describe("session helpers", () => {
  it("says how long live sync has been on", () => {
    const now = Date.parse("2026-11-25T12:00:00.000Z");
    expect(duration(null, now)).toBe("");
    expect(duration("2026-11-25T11:59:40.000Z", now)).toBe("under a minute");
    expect(duration("2026-11-25T11:48:00.000Z", now)).toBe("12 min");
    expect(duration("2026-11-25T10:48:00.000Z", now)).toBe("1 h 12 min");
  });

  it("keeps the last rolls, newest first", () => {
    let rolls: ReturnType<typeof withRoll> = [];
    for (let i = 0; i < MAX_ROLLS + 3; i++) rolls = withRoll(rolls, { at: "2026-11-25T12:00:00.000Z", label: `r${i}`, total: i });
    expect(rolls).toHaveLength(MAX_ROLLS);
    expect(rolls[0].label).toBe(`r${MAX_ROLLS + 2}`);
  });

  it("starts with an empty session and no rolls for state saved by an older version", () => {
    const state = normalize({});
    expect(state.session).toEqual({ startedAt: null, syncs: 0, rolls: 0 });
    expect(state.rolls).toEqual([]);
    expect(state.settings.autoStart).toBe(false);
  });
});

describe("characterSummary", () => {
  it("reads the name, species and classes, and an https portrait", () => {
    const raw = { data: { name: "Auren", race: { fullName: "High Elf" }, classes: [{ level: 2, definition: { name: "Wizard" } }, { level: 1, definition: { name: "Fighter" } }], decorations: { avatarUrl: "https://www.dndbeyond.com/avatars/1.png" } } };
    expect(characterSummary(raw)).toEqual({ name: "Auren", summary: "High Elf · Wizard 2 / Fighter 1", avatarUrl: "https://www.dndbeyond.com/avatars/1.png", ddbUserId: null, gameId: null, dmUserId: null });
  });

  it("reads the D&D Beyond ids a roll needs: the player, the campaign (game) and its DM", () => {
    expect(characterSummary({ data: { userId: 122333583, campaign: { id: 8266155, dmUserId: 100200300 } } })).toMatchObject({ ddbUserId: "122333583", gameId: "8266155", dmUserId: "100200300" });
    expect(characterSummary({ data: { userId: "x<1", campaign: { id: {}, dmUserId: null } } })).toMatchObject({ ddbUserId: null, gameId: null, dmUserId: null });
  });

  it("drops a portrait that is not https and copes with junk", () => {
    expect(characterSummary({ data: { name: "X", decorations: { avatarUrl: "javascript:alert(1)" } } }).avatarUrl).toBeNull();
    expect(characterSummary(null)).toEqual({ name: null, summary: "", avatarUrl: null, ddbUserId: null, gameId: null, dmUserId: null });
    expect(characterSummary({ data: { classes: "junk", race: 5 } })).toEqual({ name: null, summary: "", avatarUrl: null, ddbUserId: null, gameId: null, dmUserId: null });
  });
});

describe("originAllowed", () => {
  const patterns = ["https://dcdashboard.yangil.net/*", "http://localhost/*"];
  it("accepts the portal origins the extension runs on, any localhost port", () => {
    expect(originAllowed("https://dcdashboard.yangil.net", patterns)).toBe(true);
    expect(originAllowed("http://localhost:3917", patterns)).toBe(true);
    expect(originAllowed("http://localhost", patterns)).toBe(true);
  });
  it("refuses D&D Beyond, look-alikes, other schemes and junk", () => {
    expect(originAllowed("https://www.dndbeyond.com", patterns)).toBe(false);
    expect(originAllowed("https://dcdashboard.yangil.net.evil.com", patterns)).toBe(false);
    expect(originAllowed("http://dcdashboard.yangil.net", patterns)).toBe(false);
    expect(originAllowed("https://localhost", patterns)).toBe(false);
    expect(originAllowed("not a url", patterns)).toBe(false);
    expect(originAllowed(undefined, patterns)).toBe(false);
  });
});
