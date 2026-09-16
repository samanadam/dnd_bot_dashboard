import { describe, expect, it, vi } from "vitest";
import { matchRule } from "@/lib/bot/allowlist";
import { handleBotRequest, MAX_BODY_BYTES, READ_CACHE_MS, ReadCache, type ProxyDeps } from "@/lib/bot/proxy";
import { RateLimiter } from "@/lib/rateLimit";

const TOKEN = "test-token-abcdefghijklmnop";
const CHANNEL = "123456789012345678";

function deps(overrides: Partial<ProxyDeps> = {}): ProxyDeps & { fetchImpl: ReturnType<typeof vi.fn> } {
  const fetchImpl = vi.fn(async () => Response.json({ ok: true }));
  return {
    getUserId: async () => "42",
    botUrl: "https://bot.example/api/v1",
    botToken: TOKEN,
    fetchImpl,
    limiter: new RateLimiter(),
    cache: new ReadCache(),
    ...overrides,
  } as ProxyDeps & { fetchImpl: ReturnType<typeof vi.fn> };
}

function req(method: string, path: string, init: { body?: string; headers?: Record<string, string> } = {}) {
  return new Request(`https://portal.example/api/bot/${path}`, {
    method,
    body: init.body,
    headers: {
      "x-portal-request": "1",
      "sec-fetch-site": "same-origin",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
}

const split = (path: string) => path.split("?")[0].split("/");

describe("allowlist", () => {
  it("matches listed routes only with the right method", () => {
    expect(matchRule("GET", ["stats"])).not.toBeNull();
    expect(matchRule("POST", ["stats"])).toBeNull();
    expect(matchRule("DELETE", ["music", "queue", "3"])).not.toBeNull();
    expect(matchRule("DELETE", ["music", "queue", "x"])).toBeNull();
    expect(matchRule("POST", ["music", "queue", "move"])).not.toBeNull();
  });

  it("refuses traversal, encoded separators and unknown paths", () => {
    for (const segments of [
      ["..", "..", "etc"],
      ["stats", ".."],
      ["%2e%2e"],
      ["music%2Fstate"],
      ["music\\state"],
      ["admin"],
      ["STATS"],
      [],
      ["recording", "start", "extra"],
    ]) {
      expect(matchRule("GET", segments)).toBeNull();
      expect(matchRule("POST", segments)).toBeNull();
    }
  });
});

describe("handleBotRequest", () => {
  it("returns 401 without a session and never calls the bot", async () => {
    const d = deps({ getUserId: async () => null });
    const res = await handleBotRequest(req("GET", "stats"), ["stats"], d);
    expect(res.status).toBe(401);
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses cross-site requests and requests missing the portal header", async () => {
    const d = deps();
    const crossSite = await handleBotRequest(
      req("POST", "music/pause", { headers: { "sec-fetch-site": "cross-site" } }),
      ["music", "pause"],
      d,
    );
    expect(crossSite.status).toBe(403);
    const noHeader = new Request("https://portal.example/api/bot/stats", {
      headers: { "sec-fetch-site": "same-origin" },
    });
    expect((await handleBotRequest(noHeader, ["stats"], d)).status).toBe(403);
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });

  it("falls back to Origin vs Host when Sec-Fetch-Site is absent", async () => {
    const d = deps();
    const good = new Request("https://portal.example/api/bot/stats", {
      headers: { "x-portal-request": "1", origin: "https://portal.example", host: "portal.example" },
    });
    expect((await handleBotRequest(good, ["stats"], d)).status).toBe(200);
    const bad = new Request("https://portal.example/api/bot/stats", {
      headers: { "x-portal-request": "1", origin: "https://evil.example", host: "portal.example" },
    });
    expect((await handleBotRequest(bad, ["stats"], d)).status).toBe(403);
  });

  it("refuses unlisted paths without forwarding", async () => {
    const d = deps();
    const res = await handleBotRequest(req("GET", "../../etc"), ["..", "..", "etc"], d);
    expect(res.status).toBe(404);
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });

  it("attaches the token server-side and forwards only validated body fields", async () => {
    const d = deps();
    const res = await handleBotRequest(
      req("POST", "recording/start", { body: JSON.stringify({ channel_id: CHANNEL, name: "  Session 4 " }) }),
      ["recording", "start"],
      d,
    );
    expect(res.status).toBe(200);
    const [url, init] = d.fetchImpl.mock.calls[0];
    expect(url).toBe("https://bot.example/api/v1/recording/start");
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init.body)).toEqual({ channel_id: CHANNEL, name: "Session 4" });
    expect(init.redirect).toBe("error");
  });

  it("rejects unknown body fields, bad ids and wrong content type", async () => {
    const d = deps();
    const extra = await handleBotRequest(
      req("POST", "recording/stop", { body: JSON.stringify({ channel_id: CHANNEL, guild_id: CHANNEL }) }),
      ["recording", "stop"],
      d,
    );
    expect(extra.status).toBe(400);
    const badId = await handleBotRequest(
      req("POST", "recording/stop", { body: JSON.stringify({ channel_id: "1; DROP" }) }),
      ["recording", "stop"],
      d,
    );
    expect(badId.status).toBe(400);
    const textPlain = await handleBotRequest(
      req("POST", "music/volume", { body: '{"volume":1}', headers: { "content-type": "text/plain" } }),
      ["music", "volume"],
      d,
    );
    expect(textPlain.status).toBe(415);
    const tooLoud = await handleBotRequest(
      req("POST", "music/volume", { body: '{"volume":5}' }),
      ["music", "volume"],
      d,
    );
    expect(tooLoud.status).toBe(400);
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });

  it("caps body size", async () => {
    const d = deps();
    const res = await handleBotRequest(
      req("POST", "music/search", { body: JSON.stringify({ source: "r2", query: "x".repeat(MAX_BODY_BYTES) }) }),
      ["music", "search"],
      d,
    );
    expect(res.status).toBe(413);
  });

  it("validates and rebuilds the query string", async () => {
    const d = deps();
    const ok = await handleBotRequest(req("GET", "sessions?limit=25"), split("sessions"), d);
    expect(ok.status).toBe(200);
    expect(d.fetchImpl.mock.calls[0][0]).toBe("https://bot.example/api/v1/sessions?limit=25");

    for (const q of ["sessions?limit=25&admin=1", "sessions?limit=9999", "sessions?limit=1&limit=2"]) {
      expect((await handleBotRequest(req("GET", q), ["sessions"], d)).status).toBe(400);
    }
    expect((await handleBotRequest(req("GET", "stats?x=1"), ["stats"], d)).status).toBe(400);
  });

  it("rate limits the recording bucket at 10 per minute", async () => {
    const d = deps();
    const call = () =>
      handleBotRequest(
        req("POST", "recording/stop", { body: JSON.stringify({ channel_id: CHANNEL }) }),
        ["recording", "stop"],
        d,
      );
    for (let i = 0; i < 10; i++) expect((await call()).status).toBe(200);
    const limited = await call();
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("maps a bot 401 to 502 so the browser does not think it signed out", async () => {
    const d = deps({
      fetchImpl: vi.fn(async () =>
        Response.json({ error: { code: "unauthorized", message: "bad token" } }, { status: 401 }),
      ),
    });
    const res = await handleBotRequest(req("GET", "stats"), ["stats"], d);
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("bot_auth_failed");
  });

  it("passes shaped bot errors through and normalises the rest", async () => {
    const conflict = deps({
      fetchImpl: vi.fn(async () =>
        Response.json({ error: { code: "conflict", message: "Already recording" } }, { status: 409 }),
      ),
    });
    const res = await handleBotRequest(req("GET", "stats"), ["stats"], conflict);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: "conflict", message: "Already recording" } });

    const html = deps({ fetchImpl: vi.fn(async () => new Response("<h1>oops</h1>", { status: 500 })) });
    const res2 = await handleBotRequest(req("GET", "stats"), ["stats"], html);
    expect(res2.status).toBe(502);
    expect((await res2.json()).error.code).toBe("internal_error");
  });

  it("reports an unreachable bot as 503", async () => {
    const d = deps({ fetchImpl: vi.fn(async () => { throw new TypeError("fetch failed"); }) });
    const res = await handleBotRequest(req("GET", "stats"), ["stats"], d);
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("bot_unreachable");
  });

  it("never echoes the token in any response", async () => {
    const d = deps({ fetchImpl: vi.fn(async () => { throw new Error(TOKEN); }) });
    const res = await handleBotRequest(req("GET", "stats"), ["stats"], d);
    expect(await res.text()).not.toContain(TOKEN);
  });

  it("shares reads across users for a moment, so tab count cannot exhaust the bot's limit", async () => {
    let now = 0;
    const d = deps({ now: () => now });
    const users = ["1", "2", "3"];
    const results = await Promise.all(
      users.flatMap((id) => [0, 1, 2].map(() => handleBotRequest(req("GET", "music/state"), ["music", "state"], { ...d, getUserId: async () => id }))),
    );
    expect(results.every((res) => res.status === 200)).toBe(true);
    expect(d.fetchImpl).toHaveBeenCalledTimes(1);

    now = READ_CACHE_MS + 1;
    await handleBotRequest(req("GET", "music/state"), ["music", "state"], d);
    expect(d.fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("keeps different queries apart and never caches failures", async () => {
    const failing = deps({ fetchImpl: vi.fn(async () => new Response(null, { status: 500 })) });
    await handleBotRequest(req("GET", "stats"), ["stats"], failing);
    await handleBotRequest(req("GET", "stats"), ["stats"], failing);
    expect(failing.fetchImpl).toHaveBeenCalledTimes(2);

    const d = deps();
    await handleBotRequest(req("GET", "sessions?limit=25"), ["sessions"], d);
    await handleBotRequest(req("GET", "sessions?limit=50"), ["sessions"], d);
    expect(d.fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("still checks the session before serving from the cache", async () => {
    const d = deps();
    await handleBotRequest(req("GET", "stats"), ["stats"], d);
    const anonymous = await handleBotRequest(req("GET", "stats"), ["stats"], { ...d, getUserId: async () => null });
    expect(anonymous.status).toBe(401);
  });

  it("clears the cache after a successful change", async () => {
    const d = deps();
    await handleBotRequest(req("GET", "music/state"), ["music", "state"], d);
    await handleBotRequest(req("POST", "music/pause"), ["music", "pause"], d);
    await handleBotRequest(req("GET", "music/state"), ["music", "state"], d);
    expect(d.fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("passes a bodyless 204 from the bot through without crashing", async () => {
    const d = deps({ fetchImpl: vi.fn(async () => new Response(null, { status: 204 })) });
    const res = await handleBotRequest(req("DELETE", "music/queue"), ["music", "queue"], d);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });
});

describe("contract with the bot", () => {
  // The bot's /music/play accepts position as a queue slot only and answers
  // anything else with a 409. A numeric position passed the portal's own
  // validation and would have failed every play at the bot.
  const playBody = matchRule("POST", ["music", "play"])!.rule.body!;

  it("accepts the three queue positions the bot understands", () => {
    for (const position of ["now", "next", "end"]) {
      expect(playBody.safeParse({ source: "r2", id: "music/a.opus", position }).success).toBe(true);
    }
  });

  it("refuses a numeric position before it reaches the bot", () => {
    expect(playBody.safeParse({ source: "r2", id: "music/a.opus", position: 3 }).success).toBe(false);
  });

  it("lets position be omitted, which the bot treats as end of queue", () => {
    expect(playBody.safeParse({ source: "r2", id: "music/a.opus" }).success).toBe(true);
  });

  it("plays without a channel id, which works while a session is recording", () => {
    // Sessions start from Discord, so the dashboard often has no channel id.
    expect(playBody.safeParse({ source: "r2", id: "music/a.opus" }).success).toBe(true);
  });
});
