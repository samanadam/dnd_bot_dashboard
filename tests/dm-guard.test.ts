import { describe, expect, it } from "vitest";
import { DM_LIMITS, guardDm, readDmJson } from "@/lib/dm/guard";
import { isDm } from "@/lib/dm/isDm";
import { RateLimiter } from "@/lib/rateLimit";
import { grantedAccess, ownerAccess } from "./helpers/access";

const DM = "111111111111111111";

function req(method: string, init: { body?: string; headers?: Record<string, string> } = {}) {
  return new Request("https://portal.example/api/dm/creatures", {
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

const deps = (over: Partial<Parameters<typeof guardDm>[1]> = {}) => ({
  getAccess: ownerAccess(DM, [DM]),
  limiter: new RateLimiter(),
  ...over,
});

async function status(result: Awaited<ReturnType<typeof guardDm | typeof readDmJson>>) {
  return result.ok ? 200 : result.response.status;
}

describe("isDm", () => {
  it("denies by default", () => {
    expect(isDm(DM, [])).toBe(false);
    expect(isDm(null, [DM])).toBe(false);
    expect(isDm("", [""])).toBe(false);
    expect(isDm(DM, [DM])).toBe(true);
  });
});

describe("guardDm", () => {
  it("401 without a session", async () => {
    expect(await status(await guardDm(req("GET"), deps({ getAccess: ownerAccess(null, [DM]) })))).toBe(401);
  });

  it("404 for a signed-in user who is not the DM, before the origin check", async () => {
    const other = deps({ getAccess: ownerAccess("222222222222222222", [DM]) });
    expect(await status(await guardDm(req("GET", { headers: { "sec-fetch-site": "cross-site" } }), other))).toBe(404);
  });

  it("403 without the portal header or from another site", async () => {
    expect(await status(await guardDm(req("GET", { headers: { "x-portal-request": "" } }), deps()))).toBe(403);
    expect(await status(await guardDm(req("GET", { headers: { "sec-fetch-site": "same-site" } }), deps()))).toBe(403);
  });

  it("rate limits writes separately from reads", async () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < DM_LIMITS.dm_write.max; i++) {
      expect((await guardDm(req("POST"), deps({ limiter }))).ok).toBe(true);
    }
    const blocked = await guardDm(req("POST"), deps({ limiter }));
    expect(await status(blocked)).toBe(429);
    if (!blocked.ok) expect(blocked.response.headers.get("retry-after")).toMatch(/^\d+$/);
    expect((await guardDm(req("GET"), deps({ limiter }))).ok).toBe(true);
  });

  it("passes the DM through, seeing every campaign and unassigned content", async () => {
    const result = await guardDm(req("GET"), deps());
    expect(result).toMatchObject({ ok: true, userId: DM });
    if (!result.ok) return;
    expect(result.scope.everywhere).toBe(true);
    expect(result.scope.allows(null)).toBe(true);
    expect(result.scope.narrow(null)).toBeNull();
    expect(result.scope.narrow("unassigned")).toBe("unassigned");
  });

  it("narrows a co-DM to their campaigns", async () => {
    const CODM = "222222222222222222";
    const ROLE = "333333333333333333";
    const A = "aaaaaaaaaaaa";
    const B = "bbbbbbbbbbbb";
    const result = await guardDm(req("GET"), deps({ getAccess: grantedAccess(CODM, [ROLE], [{ roleId: ROLE, permissions: ["dm"], scope: [A] }]) }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scope.everywhere).toBe(false);
    expect(result.scope.allows(A)).toBe(true);
    expect(result.scope.allows(B)).toBe(false);
    expect(result.scope.allows(null)).toBe(false);
    expect(result.scope.narrow(null)).toEqual([A]);
    expect(result.scope.narrow(A)).toBe(A);
    expect(result.scope.narrow(B)).toBeUndefined();
    expect(result.scope.narrow("unassigned")).toBeUndefined();
  });

  it("404s a player who holds no DM permission", async () => {
    const ROLE = "333333333333333333";
    const player = deps({ getAccess: grantedAccess("222222222222222222", [ROLE], [{ roleId: ROLE, permissions: ["play"], scope: "all" }]) });
    expect(await status(await guardDm(req("GET"), player))).toBe(404);
  });
});

describe("readDmJson", () => {
  it("rejects non-JSON content type, bad JSON and oversized bodies", async () => {
    expect(await status(await readDmJson(req("POST", { body: "{}", headers: { "content-type": "text/plain" } })))).toBe(415);
    expect(await status(await readDmJson(req("POST", { body: "{" })))).toBe(400);
    expect(await status(await readDmJson(req("POST", { body: JSON.stringify({ x: "a".repeat(70_000) }) })))).toBe(413);
  });

  it("returns parsed JSON", async () => {
    expect(await readDmJson(req("POST", { body: '{"a":1}' }))).toEqual({ ok: true, json: { a: 1 } });
  });
});
