import { describe, expect, it } from "vitest";
import { handleBotRequest, ReadCache } from "@/lib/bot/proxy";
import { RateLimiter } from "@/lib/rateLimit";

// Contract test against a REAL bot API, not a mock. Every other test checks the
// portal against its own idea of the bot; this is the one that catches the two
// disagreeing. Opt-in, because it needs the bot running:
//
//   BOT_CONTRACT_URL=http://127.0.0.1:18090/api/v1 \
//   BOT_CONTRACT_TOKEN=... npx vitest run tests/bot-contract.test.ts

const url = process.env.BOT_CONTRACT_URL;
const token = process.env.BOT_CONTRACT_TOKEN;

type Json = Record<string, unknown>;

async function call(method: string, path: string, body?: unknown, deps: { token?: string } = {}) {
  const request = new Request(`http://portal.test/api/bot/${path}`, {
    method,
    headers: {
      "x-portal-request": "1",
      "sec-fetch-site": "same-origin",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const [route, query] = path.split("?");
  const target = query ? `${request.url}` : request.url;
  const response = await handleBotRequest(new Request(target, request), route.split("/"), {
    getUserId: async () => "portal-user",
    botUrl: url!,
    botToken: deps.token ?? token!,
    // Fresh per call: the contract is what the bot says, not a cached answer.
    cache: new ReadCache(),
    limiter: new RateLimiter(),
  });
  const text = await response.text();
  return { status: response.status, json: (text ? JSON.parse(text) : null) as Json };
}

describe.skipIf(!url || !token)("contract with the real bot API", () => {
  it("health is served and carries no version", async () => {
    const { status, json } = await call("GET", "health");
    expect(status).toBe(200);
    expect(json.status).toBe("ok");
    expect(json).not.toHaveProperty("version");
  });

  it("stats matches the Stats type, reachability included", async () => {
    const { status, json } = await call("GET", "stats");
    expect(status).toBe(200);
    expect(json).toHaveProperty("version");
    const storage = json.storage as Json;
    expect(["boolean", "object"]).toContain(typeof storage.reachable);
    const disk = json.disk as Json;
    expect(typeof disk.free_mb).toBe("number");
    expect(typeof disk.low_disk).toBe("boolean");
  });

  it("active recordings expose the channel id the dashboard stops by", async () => {
    const { status, json } = await call("GET", "recording");
    expect(status).toBe(200);
    const sessions = json as unknown as Json[];
    expect(sessions[0].channel_id).toMatch(/^\d{17,20}$/);
    expect(JSON.stringify(sessions)).not.toContain("started_by_user_id");
  });

  it("stopping by that channel id works end to end", async () => {
    const live = (await call("GET", "recording")).json as unknown as Json[];
    const { status, json } = await call("POST", "recording/stop", { channel_id: live[0].channel_id });
    expect(status).toBe(200);
    expect(json.session_id).toBe("live-1");
    expect(typeof json.enqueued).toBe("boolean");
  });

  it("a recording conflict arrives as a 409 with the bot's own message", async () => {
    const { status, json } = await call("POST", "recording/start", { channel_id: "123456789012345678" });
    expect(status).toBe(409);
    expect((json.error as Json).message).toBe("Already recording in #Table.");
  });

  it("a channel the bot cannot see is a 404, not a conflict", async () => {
    const { status, json } = await call("POST", "recording/start", { channel_id: "987654321098765432" });
    expect(status).toBe(404);
    expect((json.error as Json).code).toBe("not_found");
  });

  it("plays with no channel id, as while a Discord-started session records", async () => {
    const { status, json } = await call("POST", "music/play", { source: "r2", id: "music/tavern.opus" });
    expect(status).toBe(202);
    expect((json.current as Json).title).toBe("tavern");
  });

  it("every queue position the portal can send is one the bot accepts", async () => {
    for (const position of ["now", "next", "end"]) {
      const { status } = await call("POST", "music/play", { source: "r2", id: "music/tavern.opus", position });
      expect(status, `position=${position}`).toBe(202);
    }
  });

  it("bodyless transport posts are accepted, not refused as non-JSON", async () => {
    for (const action of ["pause", "resume", "skip", "stop"]) {
      const { status } = await call("POST", `music/${action}`);
      // 200, or 409 when the action makes no sense in the current state - never 415.
      expect([200, 409], `music/${action}`).toContain(status);
    }
  });

  it("volume and loop round-trip into player state", async () => {
    expect((await call("POST", "music/volume", { volume: 0.7 })).json.volume).toBe(0.7);
    expect((await call("POST", "music/loop", { mode: "queue" })).json.loop).toBe("queue");
  });

  it("an unknown track is reported as a resolver failure", async () => {
    const { status, json } = await call("POST", "music/play", { source: "r2", id: "music/nope.opus" });
    expect(status).toBe(502);
    expect((json.error as Json).code).toBe("resolver_failed");
  });

  it("the library is shaped like Track[]", async () => {
    const { status, json } = await call("GET", "music/library?source=r2&limit=10");
    expect(status).toBe(200);
    const tracks = json as unknown as Json[];
    expect(tracks[0]).toMatchObject({ id: expect.any(String), title: expect.any(String), source: "r2" });
    expect(tracks[0]).not.toHaveProperty("uri");
  });

  it("a wrong bot token surfaces as 502, not as the user's session ending", async () => {
    const { status, json } = await call("GET", "stats", undefined, { token: "wrong-token-value-here" });
    expect(status).toBe(502);
    expect((json.error as Json).code).toBe("bot_auth_failed");
  });
});
