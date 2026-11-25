import { describe, expect, it } from "vitest";
import { clampInterval, DEFAULT_SETTINGS, syncAll, syncCharacter, type SyncDeps } from "../extension/src/sync";

type Pushed = { ddbCharacterId: string; capturedAt: string; readOnly: boolean; character: unknown };

function setup(over: Partial<SyncDeps> = {}) {
  const pushed: Pushed[] = [];
  const failed: Array<[string, string | null]> = [];
  const calls = { tokens: 0, invalidated: 0, fetched: [] as string[], notMine: [] as Array<[string, unknown]> };
  const deps: SyncDeps = {
    getToken: async () => {
      calls.tokens += 1;
      return "tok";
    },
    invalidateToken: () => {
      calls.invalidated += 1;
    },
    fetchCharacter: async (id) => {
      calls.fetched.push(id);
      return { status: 200, json: { data: { name: "Auren", canEdit: true } } };
    },
    push: async (message) => {
      pushed.push(message);
      return { ok: true };
    },
    report: (id, error) => void failed.push([id, error]),
    notMine: (id, character) => void calls.notMine.push([id, character]),
    now: () => Date.parse("2026-11-25T10:00:00.000Z"),
    ...over,
  };
  return { deps, pushed, failed, calls };
}

describe("syncCharacter", () => {
  it("fetches the character and pushes it with the time and read-only flag", async () => {
    const { deps, pushed } = setup();
    expect(await syncCharacter(deps, "42")).toBe("ok");
    expect(pushed).toEqual([{ ddbCharacterId: "42", capturedAt: "2026-11-25T10:00:00.000Z", readOnly: false, character: { data: { name: "Auren", canEdit: true } } }]);
  });

  it("keeps another player's character (one you cannot edit) to itself: nothing is pushed and no error is shown", async () => {
    const friend = { data: { name: "Bongo", canEdit: false } };
    const { deps, pushed, failed, calls } = setup({ fetchCharacter: async () => ({ status: 200, json: friend }) });
    expect(await syncCharacter(deps, "42")).toBe("notmine");
    expect(pushed).toEqual([]);
    expect(failed).toEqual([]);
    expect(calls.notMine).toEqual([["42", friend]]);
  });

  it("says to sign in to D&D Beyond when no token can be had, and pushes nothing", async () => {
    const { deps, pushed, failed } = setup({
      getToken: async () => {
        throw new Error("token 401");
      },
    });
    expect(await syncCharacter(deps, "42")).toBe("signin");
    expect(pushed).toEqual([]);
    expect(failed).toEqual([["42", "Sign in to D&D Beyond in this browser."]]);
  });

  it("refreshes the token once when D&D Beyond refuses it, then gives up with a message", async () => {
    let n = 0;
    const { deps, calls, failed } = setup({ fetchCharacter: async () => ({ status: (n += 1) <= 5 ? 403 : 200 }) });
    expect(await syncCharacter(deps, "42")).toBe("signin");
    expect(calls.invalidated).toBe(2);
    expect(calls.tokens).toBe(2);
    expect(n).toBe(2);
    expect(failed.at(-1)?.[1]).toMatch(/refused/);
  });

  it("recovers when the second try with a fresh token works", async () => {
    let n = 0;
    const { deps, pushed } = setup({ fetchCharacter: async () => (++n === 1 ? { status: 401 } : { status: 200, json: { data: { canEdit: true } } }) });
    expect(await syncCharacter(deps, "42")).toBe("ok");
    expect(pushed).toHaveLength(1);
  });

  it("explains a missing character and other failures", async () => {
    const missing = setup({ fetchCharacter: async () => ({ status: 404 }) });
    expect(await syncCharacter(missing.deps, "1")).toBe("error");
    expect(missing.failed.at(-1)?.[1]).toMatch(/not found/i);
    const down = setup({ fetchCharacter: async () => ({ status: 500 }) });
    expect(await syncCharacter(down.deps, "1")).toBe("error");
    expect(down.failed.at(-1)?.[1]).toMatch(/500/);
    const offline = setup({
      fetchCharacter: async () => {
        throw new Error("network");
      },
    });
    expect(await syncCharacter(offline.deps, "1")).toBe("error");
    expect(offline.failed.at(-1)?.[1]).toMatch(/reach D&D Beyond/);
  });

  it("reports the portal's refusal as an error", async () => {
    const { deps } = setup({ push: async () => ({ ok: false }) });
    expect(await syncCharacter(deps, "42")).toBe("error");
  });

  it("does not run twice at once for the same character", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { deps, calls } = setup({
      fetchCharacter: async (id) => {
        calls.fetched.push(id);
        await gate;
        return { status: 200, json: { data: { canEdit: true } } };
      },
    });
    const first = syncCharacter(deps, "42");
    expect(await syncCharacter(deps, "42")).toBe("busy");
    release();
    expect(await first).toBe("ok");
    expect(calls.fetched).toEqual(["42"]);
  });
});

describe("syncAll", () => {
  it("syncs every character, one failing does not stop the rest", async () => {
    const { deps, pushed } = setup({
      fetchCharacter: async (id) => (id === "2" ? { status: 500 } : { status: 200, json: { data: { canEdit: true } } }),
    });
    const result = await syncAll(deps, ["1", "2", "3"]);
    expect(result).toEqual({ "1": "ok", "2": "error", "3": "ok" });
    expect(pushed.map((p) => p.ddbCharacterId)).toEqual(["1", "3"]);
  });

  it("asks D&D Beyond for the token once for the whole round", async () => {
    const { deps, calls } = setup();
    await syncAll(deps, ["1", "2", "3"]);
    expect(calls.tokens).toBe(1);
  });
});

describe("settings", () => {
  it("keeps the live interval between 30 and 60 seconds and falls back to the default", () => {
    expect(clampInterval(5)).toBe(30);
    expect(clampInterval(45)).toBe(45);
    expect(clampInterval(9999)).toBe(60);
    expect(clampInterval("abc")).toBe(DEFAULT_SETTINGS.intervalSeconds);
    expect(clampInterval(undefined)).toBe(30);
    expect(clampInterval(41.7)).toBe(41);
  });

  it("starts with live sync off, so the player starts it on purpose", () => {
    expect(DEFAULT_SETTINGS.live).toBe(false);
  });
});
