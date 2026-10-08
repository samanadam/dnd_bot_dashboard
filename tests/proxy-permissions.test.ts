import { describe, expect, it, vi } from "vitest";
import { allowsFor, resolveAccess, type Grant } from "@/lib/access/permissions";
import { allowlistForTests } from "@/lib/bot/allowlist";
import { handleBotRequest, ReadCache } from "@/lib/bot/proxy";
import { RateLimiter } from "@/lib/rateLimit";

const OWNER = "111111111111111111";
const USER = "222222222222222222";
const OPS = "333333333333333333";
const PLAYERS = "444444444444444444";
const CODM = "555555555555555555";
const GRANTS: Grant[] = [
  { roleId: OPS, permissions: ["bot.view", "bot.recording", "bot.music", "bot.sessions"], scope: "all" },
  { roleId: PLAYERS, permissions: ["play"], scope: "all" },
  { roleId: CODM, permissions: ["dm", "bot.view", "bot.manage"], scope: ["aaaaaaaaaaaa"] },
];

function call(roles: string[], method: string, segments: string[], user = USER) {
  const access = user === OWNER ? resolveAccess(OWNER, [], [OWNER], GRANTS) : resolveAccess(user, roles, [OWNER], GRANTS);
  const fetchImpl = vi.fn(async () => Response.json({ ok: true }));
  const request = new Request(`https://portal.example/api/bot/${segments.join("/")}`, {
    method,
    headers: { "x-portal-request": "1", "sec-fetch-site": "same-origin", ...(method === "GET" ? {} : { "content-type": "application/json" }) },
    body: method === "GET" ? undefined : "{}",
  });
  return handleBotRequest(request, segments, {
    getUserId: async () => access.userId,
    botUrl: "https://bot.example",
    botToken: "test-token-abcdefghijklmnop",
    fetchImpl,
    limiter: new RateLimiter(),
    cache: new ReadCache(),
    allows: allowsFor(access),
  }).then((response) => ({ status: response.status, reached: fetchImpl.mock.calls.length > 0 }));
}

describe("the bot proxy under role grants", () => {
  it("gives a Bot operator exactly the old non-DM calls", async () => {
    expect((await call([OPS], "GET", ["stats"])).reached).toBe(true);
    expect((await call([OPS], "GET", ["sessions"])).reached).toBe(true);
    expect((await call([OPS], "POST", ["music", "pause"])).reached).toBe(true);
    for (const [method, segments] of [
      ["GET", ["sessions", "trash"]],
      ["GET", ["initiative"]],
      ["GET", ["soundboard"]],
      ["POST", ["transcription", "sync"]],
    ] as const) {
      const result = await call([OPS], method, [...segments]);
      expect(result, segments.join("/")).toEqual({ status: 404, reached: false });
    }
  });

  it("gives a player nothing on the bot at all", async () => {
    for (const rule of allowlistForTests.filter((r) => r.method === "GET" && !r.path.includes(":"))) {
      const result = await call([PLAYERS], "GET", rule.path.split("/"));
      expect(result, rule.path).toEqual({ status: 404, reached: false });
    }
  });

  it("keeps owner-only calls from a co-DM, and lets the owner make them", async () => {
    const purge = ["sessions", "2026-09-09-2130-a1b2c3d4", "purge"];
    expect(await call([CODM], "POST", purge)).toEqual({ status: 404, reached: false });
    expect((await call([], "POST", purge, OWNER)).status).not.toBe(404);
  });

  it("lets a co-DM use the DM tools' bot calls", async () => {
    expect((await call([CODM], "GET", ["initiative"])).reached).toBe(true);
    expect((await call([CODM], "GET", ["sessions", "trash"])).reached).toBe(true);
  });

  it("never allows a different user than the one resolved", () => {
    const access = resolveAccess(USER, [OPS], [OWNER], GRANTS);
    expect(allowsFor(access)(USER, "bot.view")).toBe(true);
    expect(allowsFor(access)(OWNER, "bot.view")).toBe(false);
    expect(allowsFor(null)(USER, "bot.view")).toBe(false);
  });

  it("gives every rule a permission", () => {
    for (const rule of allowlistForTests) expect(rule.permission, `${rule.method} ${rule.path}`).toMatch(/^(bot\.(view|recording|music|sessions|manage)|dm|owner)$/);
  });
});
