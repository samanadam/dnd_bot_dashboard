import { describe, expect, it, vi } from "vitest";
import { GrantRepo, UserRepo } from "@/lib/access/grants";
import { accessMe, grantCollection, grantItem, type GuildRole } from "@/lib/access/routes";
import { openDatabase } from "@/lib/dm/db";
import { RateLimiter } from "@/lib/rateLimit";
import { grantedAccess, ownerAccess } from "./helpers/access";

vi.mock("server-only", () => ({}));

const OWNER = "111111111111111111";
const CODM = "222222222222222222";
const ROLE = "333333333333333333";
const OTHER_ROLE = "444444444444444444";
const A = "aaaaaaaaaaaa";

const ROLES: GuildRole[] = [{ id: ROLE, name: "Players", color: 0, position: 2 }];
const CAMPAIGNS = [{ id: A, name: "Ember", archived: false }];

function setup(user: string | null = OWNER, bot: { roles?: GuildRole[] | null; campaigns?: typeof CAMPAIGNS | null } = {}) {
  const db = openDatabase(":memory:");
  const logs: Array<Record<string, unknown>> = [];
  const deps = {
    getAccess: user === CODM ? grantedAccess(CODM, [ROLE], [{ roleId: ROLE, permissions: ["dm"], scope: "all" }]) : ownerAccess(user, [OWNER]),
    limiter: new RateLimiter(),
    grants: () => new GrantRepo(db),
    users: () => new UserRepo(db),
    roles: async () => (bot.roles === undefined ? ROLES : bot.roles),
    campaigns: async () => (bot.campaigns === undefined ? CAMPAIGNS : bot.campaigns),
    log: (entry: Record<string, unknown>) => logs.push(entry),
  };
  return { db, deps, logs };
}

function req(method: string, body?: unknown) {
  return new Request("https://portal.example/api/access/grants", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "x-portal-request": "1", "sec-fetch-site": "same-origin", ...(body === undefined ? {} : { "content-type": "application/json" }) },
  });
}

describe("grant editor API", () => {
  it("lets the owner create, replace and delete a grant, auditing before and after", async () => {
    const { deps, logs } = setup();
    const put = await grantItem(deps).PUT(req("PUT", { permissions: ["play"], scope: [A] }), ROLE);
    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject({ roleId: ROLE, label: "Players", permissions: ["play"], scope: [A] });
    await grantItem(deps).PUT(req("PUT", { permissions: ["play", "sheets.manage"], scope: "all" }), ROLE);
    expect(logs[1]).toMatchObject({ event: "access_change", userId: OWNER });
    expect(JSON.parse(String(logs[1].detail))).toEqual({
      role: ROLE,
      before: { permissions: ["play"], scope: [A] },
      after: { permissions: ["play", "sheets.manage"], scope: "all" },
    });
    const view = await (await grantCollection(deps).GET(req("GET"))).json();
    expect(view.grants).toHaveLength(1);
    expect(view.roles).toEqual(ROLES);
    expect((await grantItem(deps).DELETE(req("DELETE"), ROLE)).status).toBe(204);
    expect((await grantItem(deps).DELETE(req("DELETE"), ROLE)).status).toBe(404);
  });

  it("is the owner's alone: a full co-DM and anonymous callers are refused", async () => {
    for (const user of [CODM, null]) {
      const { deps } = setup(user);
      const expected = user ? 404 : 401;
      expect((await grantCollection(deps).GET(req("GET"))).status).toBe(expected);
      expect((await grantItem(deps).PUT(req("PUT", { permissions: ["dm"], scope: "all" }), ROLE)).status).toBe(expected);
      expect((await grantItem(deps).DELETE(req("DELETE"), ROLE)).status).toBe(expected);
    }
  });

  it("only names real roles and campaigns, and needs the bot to check them", async () => {
    const { deps } = setup();
    expect((await grantItem(deps).PUT(req("PUT", { permissions: ["play"], scope: "all" }), OTHER_ROLE)).status).toBe(400);
    expect((await grantItem(deps).PUT(req("PUT", { permissions: ["play"], scope: ["ffffffffffff"] }), ROLE)).status).toBe(400);
    expect((await grantItem(deps).PUT(req("PUT", { permissions: ["root"], scope: "all" }), ROLE)).status).toBe(400);
    expect((await grantItem(deps).PUT(req("PUT", { permissions: ["play"], scope: "all" }), "1")).status).toBe(404);
    const offline = setup(OWNER, { roles: null });
    expect((await grantItem(offline.deps).PUT(req("PUT", { permissions: ["play"], scope: "all" }), ROLE)).status).toBe(503);
  });

  it("counts who holds a role without naming anyone", async () => {
    const { deps } = setup();
    deps.users().upsert("555555555555555555", "Aria", null, [ROLE]);
    deps.users().upsert("666666666666666666", "Bram", null, [ROLE, OTHER_ROLE]);
    const text = await (await grantCollection(deps).GET(req("GET"))).text();
    expect(JSON.parse(text)).toMatchObject({ holders: { [ROLE]: 2, [OTHER_ROLE]: 1 }, signedIn: 2 });
    expect(text).not.toContain("555555555555555555");
    expect(text).not.toContain("Aria");
  });
});

describe("own access summary", () => {
  it("tells any signed-in user their own permissions", async () => {
    const response = await accessMe({ getAccess: grantedAccess(CODM, [ROLE], [{ roleId: ROLE, permissions: ["play"], scope: [A] }]) }).GET(req("GET"));
    expect(await response.json()).toEqual({ owner: false, permissions: { play: [A] } });
    expect((await accessMe({ getAccess: ownerAccess(null, []) }).GET(req("GET"))).status).toBe(401);
  });
});

describe("server-side bot client", () => {
  it("refuses any path outside its list and attaches the token itself", async () => {
    const { botServer } = await import("@/lib/bot/server");
    const fetchImpl = vi.fn(async () => Response.json([{ id: ROLE, name: "Players", color: 0, position: 1 }]));
    const deps = { botUrl: "https://bot.example/api/v1", botToken: "secret-token-abcdefgh", fetchImpl };
    const ok = await botServer("GET", "guild/roles", { deps });
    expect(ok.ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://bot.example/api/v1/guild/roles");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token-abcdefgh");
    expect(init.redirect).toBe("error");
    for (const path of ["recording/stop", "sessions/x/purge", "guild/roles/../x", "campaigns?archived=0", "campaigns/ABC/characters"]) {
      expect((await botServer("POST", path, { deps })).ok, path).toBe(false);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("validates answers and shapes errors", async () => {
    const { botServer } = await import("@/lib/bot/server");
    const { z } = await import("zod");
    const odd = { botUrl: "https://bot.example/api/v1", botToken: "t".repeat(20), fetchImpl: vi.fn(async () => Response.json({ nope: 1 })) };
    expect(await botServer("GET", "guild/roles", { deps: odd, schema: z.array(z.string()) })).toMatchObject({ ok: false, code: "bad_upstream" });
    const refused = { ...odd, fetchImpl: vi.fn(async () => Response.json({ error: { code: "guild_unavailable", message: "x" } }, { status: 503 })) };
    expect(await botServer("GET", "guild/roles", { deps: refused })).toMatchObject({ ok: false, status: 503, code: "guild_unavailable" });
    const down = { ...odd, fetchImpl: vi.fn(async () => Promise.reject(new TypeError("down"))) };
    expect(await botServer("GET", "guild/roles", { deps: down })).toMatchObject({ ok: false, code: "bot_unreachable" });
  });
});
