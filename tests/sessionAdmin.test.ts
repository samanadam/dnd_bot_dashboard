import { describe, expect, it, vi } from "vitest";
import { matchRule } from "@/lib/bot/allowlist";
import { handleBotRequest, ReadCache, type ProxyDeps } from "@/lib/bot/proxy";
import { daysLeft } from "@/components/bot/TrashCard";
import { RateLimiter } from "@/lib/rateLimit";
import { legacyAllows } from "./helpers/access";

const ID = "2026-09-09-2130-a1b2c3d4";

describe("renaming and deleting a session through the proxy", () => {
  it("needs bot.manage (purging: the owner), and every write is audited", () => {
    for (const action of ["update", "trash", "restore", "purge"]) {
      const rule = matchRule("POST", ["sessions", ID, action])?.rule;
      expect(rule?.permission, action).toBe(action === "purge" ? "owner" : "bot.manage");
      expect(rule?.audit, action).toBe(true);
    }
    expect(matchRule("GET", ["sessions", "trash"])?.rule.permission).toBe("bot.manage");
  });

  it("has no other way in", () => {
    expect(matchRule("DELETE", ["sessions", ID])).toBeNull();
    expect(matchRule("POST", ["sessions", ID, "delete"])).toBeNull();
    expect(matchRule("GET", ["sessions", ID, "purge"])).toBeNull();
    expect(matchRule("POST", ["sessions", "..", "purge"])).toBeNull();
    expect(matchRule("POST", ["sessions", "AB", "purge"])).toBeNull();
    expect(matchRule("POST", ["sessions", ID, "purge", "extra"])).toBeNull();
    expect(matchRule("POST", ["sessions", "trash"])).toBeNull();
  });

  it("only accepts a change that repeats a session id", () => {
    for (const action of ["trash", "restore", "purge"]) {
      const body = matchRule("POST", ["sessions", ID, action])!.rule.body!;
      expect(body.safeParse({ confirm_id: ID }).success, action).toBe(true);
      for (const bad of [{}, { confirm_id: "" }, { confirm_id: "../x" }, { confirm_id: ID, extra: 1 }, { confirm_id: 5 }, { confirm: ID }]) {
        expect(body.safeParse(bad).success, `${action} ${JSON.stringify(bad)}`).toBe(false);
      }
    }
  });

  it("validates the new name", () => {
    const body = matchRule("POST", ["sessions", ID, "update"])!.rule.body!;
    expect(body.safeParse({ name: "Session zero" }).success).toBe(true);
    expect(body.safeParse({ name: "Sessão ✨" }).success).toBe(true);
    for (const bad of [{}, { name: "" }, { name: "   " }, { name: "x".repeat(101) }, { name: "a\nb" }, { name: `a${String.fromCharCode(0)}b` }, { name: "ok", id: "other" }, { name: 3 }]) {
      expect(body.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

function deps(isDm: boolean): ProxyDeps & { fetchImpl: ReturnType<typeof vi.fn> } {
  const fetchImpl = vi.fn(async () => Response.json({ deleted: ID }));
  return {
    getUserId: async () => "42",
    allows: legacyAllows(() => isDm),
    botUrl: "https://bot.example/api/v1",
    botToken: "test-token-abcdefghijklmnop",
    fetchImpl,
    limiter: new RateLimiter(),
    cache: new ReadCache(),
  } as ProxyDeps & { fetchImpl: ReturnType<typeof vi.fn> };
}

const post = (action: string, body: unknown) =>
  new Request(`https://portal.example/api/bot/sessions/${ID}/${action}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "x-portal-request": "1", "content-type": "application/json", "sec-fetch-site": "same-origin" },
  });

describe("who may delete", () => {
  it("answers a player with a plain 404 and never calls the bot", async () => {
    for (const action of ["trash", "restore", "purge"]) {
      const d = deps(false);
      const response = await handleBotRequest(post(action, { confirm_id: ID }), ["sessions", ID, action], d);
      expect(response.status, action).toBe(404);
      expect(d.fetchImpl).not.toHaveBeenCalled();
    }
  });

  it("keeps the trash list from players too", async () => {
    const d = deps(false);
    const request = new Request("https://portal.example/api/bot/sessions/trash", {
      headers: { "x-portal-request": "1", "sec-fetch-site": "same-origin" },
    });
    expect((await handleBotRequest(request, ["sessions", "trash"], d)).status).toBe(404);
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses an invalid body before the bot is called", async () => {
    const d = deps(true);
    const response = await handleBotRequest(post("purge", { confirm_id: ID, extra: 1 }), ["sessions", ID, "purge"], d);
    expect(response.status).toBe(400);
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });

  it("forwards a valid purge from the DM with the confirmation intact", async () => {
    const d = deps(true);
    const response = await handleBotRequest(post("purge", { confirm_id: ID }), ["sessions", ID, "purge"], d);
    expect(response.status).toBe(200);
    expect(d.fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = d.fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://bot.example/api/v1/sessions/${ID}/purge`);
    expect(JSON.parse(String(init.body))).toEqual({ confirm_id: ID });
  });
});

describe("days left in the trash", () => {
  const now = Date.parse("2026-09-20T12:00:00Z");
  it("rounds up and never goes below zero", () => {
    expect(daysLeft("2026-09-27T12:00:00Z", now)).toBe(7);
    expect(daysLeft("2026-09-20T13:00:00Z", now)).toBe(1);
    expect(daysLeft("2026-09-19T00:00:00Z", now)).toBe(0);
  });
  it("copes with missing or broken dates", () => {
    expect(daysLeft(null, now)).toBeNull();
    expect(daysLeft("not a date", now)).toBeNull();
  });
});
