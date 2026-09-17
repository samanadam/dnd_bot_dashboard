import { describe, expect, it, vi } from "vitest";
import { handleBotRequest, ReadCache, type ProxyDeps } from "@/lib/bot/proxy";
import { RateLimiter } from "@/lib/rateLimit";

const DM = "111111111111111111";

function deps(isDm?: (id: string) => boolean) {
  const fetchImpl = vi.fn<(...args: unknown[]) => Promise<Response>>(async () => Response.json({ sent: true, channel_id: "123456789012345678" }));
  const log = vi.fn();
  const value: ProxyDeps = {
    getUserId: async () => DM,
    botUrl: "https://bot.example/api/v1",
    botToken: "test-token-abcdefghijklmnop",
    fetchImpl: fetchImpl as unknown as typeof fetch,
    limiter: new RateLimiter(),
    cache: new ReadCache(),
    log,
    isDm,
  };
  return { value, fetchImpl, log };
}

const body = { expression: "2d20kh1+5", total: 23, breakdown: "[18, (7)] + 5", label: "Scimitar to hit" };

function req(payload: unknown) {
  return new Request("https://portal.example/api/bot/dice/announce", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "x-portal-request": "1", "sec-fetch-site": "same-origin", "content-type": "application/json" },
  });
}

describe("dice/announce proxy rule", () => {
  it("forwards a valid roll for the DM", async () => {
    const d = deps((id) => id === DM);
    const response = await handleBotRequest(req(body), ["dice", "announce"], d.value);
    expect(response.status).toBe(200);
    const [url, init] = d.fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://bot.example/api/v1/dice/announce");
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it("is 404 for non-DM users and when isDm is not wired, and never reaches the bot", async () => {
    for (const d of [deps(() => false), deps(undefined)]) {
      const response = await handleBotRequest(req(body), ["dice", "announce"], d.value);
      expect(response.status).toBe(404);
      expect(d.fetchImpl).not.toHaveBeenCalled();
      expect(d.log).toHaveBeenCalledWith(expect.objectContaining({ event: "bot_refused", detail: "dm_only" }));
    }
  });

  it.each([
    [{ ...body, expression: "1d20`" }],
    [{ ...body, expression: "" }],
    [{ ...body, total: 1.5 }],
    [{ ...body, total: "23" }],
    [{ ...body, breakdown: "x".repeat(301) }],
    [{ ...body, label: "x".repeat(81) }],
    [{ ...body, channel_id: "general" }],
    [{ ...body, extra: true }],
  ])("rejects %j", async (payload) => {
    const d = deps(() => true);
    const response = await handleBotRequest(req(payload), ["dice", "announce"], d.value);
    expect(response.status).toBe(400);
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });
});
