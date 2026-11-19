import { describe, expect, it, vi } from "vitest";
import { matchRule } from "@/lib/bot/allowlist";
import { handleBotRequest, ReadCache, type ProxyDeps } from "@/lib/bot/proxy";
import { RateLimiter } from "@/lib/rateLimit";
import { legacyAllows } from "./helpers/access";

function deps(): ProxyDeps & { fetchImpl: ReturnType<typeof vi.fn> } {
  const fetchImpl = vi.fn(async () => Response.json({ cast_id: "a", ticket: "t", expires_in: 30 }, { status: 202 }));
  return {
    getUserId: async () => "42",
    allows: legacyAllows(),
    botUrl: "https://bot.example/api/v1",
    botToken: "test-token-abcdefghijklmnop",
    fetchImpl,
    limiter: new RateLimiter(),
    cache: new ReadCache(),
  } as ProxyDeps & { fetchImpl: ReturnType<typeof vi.fn> };
}

const post = (path: string, body?: unknown) =>
  new Request(`https://portal.example/api/bot/${path}`, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "x-portal-request": "1", "sec-fetch-site": "same-origin", ...(body === undefined ? {} : { "content-type": "application/json" }) },
  });

describe("cast routes", () => {
  it("are POST only, under the music permission, and audited", () => {
    for (const path of ["start", "stop"]) {
      expect(matchRule("GET", ["cast", path])).toBeNull();
      const rule = matchRule("POST", ["cast", path])?.rule;
      expect(rule?.permission).toBe("bot.music");
      expect(rule?.audit).toBe(true);
    }
    expect(matchRule("GET", ["cast", "ws"])).toBeNull();
  });

  it("forwards a valid start and nothing but the validated fields", async () => {
    const d = deps();
    const response = await handleBotRequest(post("cast/start", { name: "  Aria ", channel_id: "123456789012345678" }), ["cast", "start"], d);
    expect(response.status).toBe(202);
    const [, init] = d.fetchImpl.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ name: "Aria", channel_id: "123456789012345678" });
  });

  it("refuses a missing or oversized name and unknown fields", async () => {
    const d = deps();
    for (const body of [{}, { name: "" }, { name: "x".repeat(41) }, { name: "A", extra: 1 }, { name: "A", channel_id: "1; DROP" }]) {
      expect((await handleBotRequest(post("cast/start", body), ["cast", "start"], d)).status).toBe(400);
    }
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });

  it("stops with an empty body", async () => {
    const d = deps();
    expect((await handleBotRequest(post("cast/stop"), ["cast", "stop"], d)).status).toBe(202);
  });
});
