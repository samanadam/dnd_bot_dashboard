import * as OTPAuth from "otpauth";
import { describe, expect, it } from "vitest";
import { UserRepo } from "@/lib/access/grants";
import { openDatabase } from "@/lib/dm/db";
import { RateLimiter } from "@/lib/rateLimit";
import { TotpRepo } from "@/lib/totp/repo";
import { totpAdmin, totpConfirm, totpSelf, totpSetup } from "@/lib/totp/routes";
import { grantedAccess, ownerAccess } from "./helpers/access";

const OWNER = "111111111111111111";
const ANN = "222222222222222222";
const BO = "333333333333333333";
const ROLE = "555555555555555555";
const KEY = "k".repeat(40);
const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
const BASE = "https://portal.example/api/dm/totp";

function req(method: string, path: string, body?: unknown) {
  return new Request(`${BASE}${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      "x-portal-request": "1",
      "sec-fetch-site": "same-origin",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
  });
}

function setup(user: string | null = ANN) {
  const db = openDatabase(":memory:");
  const users = new UserRepo(db);
  users.upsert(OWNER, "Dungeon Master", null, []);
  users.upsert(ANN, "Ann", null, []);
  users.upsert(BO, "Bo", null, []);
  const getAccess =
    user === OWNER || user === null ? ownerAccess(user, [OWNER]) : grantedAccess(user, [ROLE], [{ roleId: ROLE, permissions: ["play"], scope: "all" }]);
  const logs: unknown[] = [];
  const deps = {
    getAccess,
    limiter: new RateLimiter(),
    repo: () => new TotpRepo(db),
    users: () => users.list(),
    authSecret: () => KEY,
    qr: async (text: string) => `data:image/png;base64,QR(${text.length})`,
    now: () => NOW,
    log: (entry: unknown) => logs.push(entry),
  };
  return { db, deps, logs, repo: new TotpRepo(db) };
}

const codeFor = (secret: string, ms = NOW) => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 }).generate({ timestamp: ms });

describe("code sign-in enrollment", () => {
  it("needs a signed-in user", async () => {
    const { deps } = setup(null);
    expect((await totpSelf(deps).GET(req("GET", ""))).status).toBe(401);
    expect((await totpSetup(deps).POST(req("POST", "/setup"))).status).toBe(401);
  });

  it("starts as none, becomes pending on setup, and only active after a correct code", async () => {
    const { deps, db } = setup(ANN);
    expect(await (await totpSelf(deps).GET(req("GET", ""))).json()).toEqual({ status: "none" });

    const setupBody = await (await totpSetup(deps).POST(req("POST", "/setup"))).json();
    expect(setupBody.secret).toMatch(/^[A-Z2-7]+$/);
    expect(setupBody.uri.startsWith("otpauth://totp/")).toBe(true);
    expect(setupBody.qr.startsWith("data:image/png")).toBe(true);
    expect((await (await totpSelf(deps).GET(req("GET", ""))).json()).status).toBe("pending");
    // The stored copy is encrypted, never the base32 secret itself.
    const stored = db.prepare("SELECT secret_enc FROM totp_credentials WHERE user_id = ?").get(ANN) as { secret_enc: string };
    expect(stored.secret_enc).not.toContain(setupBody.secret);

    expect((await totpConfirm(deps).POST(req("POST", "/confirm", { code: "000000" }))).status).toBe(400);
    expect((await (await totpSelf(deps).GET(req("GET", ""))).json()).status).toBe("pending");
    expect((await totpConfirm(deps).POST(req("POST", "/confirm", { code: codeFor(setupBody.secret) }))).status).toBe(200);
    expect((await (await totpSelf(deps).GET(req("GET", ""))).json()).status).toBe("active");
  });

  it("refuses to confirm when no setup was started, and rejects malformed bodies", async () => {
    const { deps } = setup(ANN);
    expect((await totpConfirm(deps).POST(req("POST", "/confirm", { code: "123456" }))).status).toBe(400);
    expect((await totpConfirm(deps).POST(req("POST", "/confirm", { code: 5 }))).status).toBe(400);
  });

  it("lets a user turn their own code sign-in off", async () => {
    const { deps, repo } = setup(ANN);
    const body = await (await totpSetup(deps).POST(req("POST", "/setup"))).json();
    await totpConfirm(deps).POST(req("POST", "/confirm", { code: codeFor(body.secret) }));
    expect((await totpSelf(deps).DELETE(req("DELETE", ""))).status).toBe(200);
    expect(repo.get(ANN)).toBeNull();
  });
});

describe("code sign-in management for the owner", () => {
  it("is owner-only", async () => {
    const { deps } = setup(ANN);
    expect((await totpAdmin(deps).GET(req("GET", "/users"))).status).toBe(404);
    expect((await totpAdmin(deps).DELETE(req("DELETE", "/users", { userId: BO }))).status).toBe(404);
  });

  it("lists who can sign in with a code and turns one off", async () => {
    const { deps, repo } = setup(OWNER);
    repo.startSetup(ANN, "x", NOW);
    repo.activate(ANN, 0);
    repo.startSetup(BO, "y", NOW); // still pending: not listed
    const list = await (await totpAdmin(deps).GET(req("GET", "/users"))).json();
    expect(list.users).toEqual([{ userId: ANN, displayName: "Ann" }]);
    expect((await totpAdmin(deps).DELETE(req("DELETE", "/users", { userId: ANN }))).status).toBe(200);
    expect(repo.activeUserIds()).toEqual([]);
  });

  it("rejects a malformed user id", async () => {
    const { deps } = setup(OWNER);
    expect((await totpAdmin(deps).DELETE(req("DELETE", "/users", { userId: "nope" }))).status).toBe(400);
  });
});
