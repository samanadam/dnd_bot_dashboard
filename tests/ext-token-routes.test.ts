import { describe, expect, it } from "vitest";
import { DdbLinkRepo } from "@/lib/ddb/links";
import { openDatabase } from "@/lib/dm/db";
import { extTokenItem, extTokens } from "@/lib/ext/tokenRoutes";
import { ExtTokenRepo } from "@/lib/ext/tokens";
import { RateLimiter } from "@/lib/rateLimit";
import { SheetRepo } from "@/lib/sheets/repo";
import { grantedAccess } from "./helpers/access";

const ARIA = "100000000000000002";
const BRAM = "100000000000000003";
const ROLE = "200000000000000001";
const EMBER = "aaaaaaaaaaaa";
const FROST = "bbbbbbbbbbbb";

function setup(user: string | null = ARIA) {
  const db = openDatabase(":memory:");
  const getAccess = user ? grantedAccess(user, [ROLE], [{ roleId: ROLE, permissions: ["play"], scope: [EMBER] }]) : async () => null;
  const deps = {
    getAccess,
    limiter: new RateLimiter(),
    tokens: () => new ExtTokenRepo(db),
    links: () => new DdbLinkRepo(db),
    campaigns: async () => [
      { id: EMBER, name: "Ember" },
      { id: FROST, name: "Frost" },
    ],
  };
  return { db, deps };
}

function req(method: string, body?: unknown) {
  return new Request("https://portal.example/api/dm/ext/tokens", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "x-portal-request": "1", "sec-fetch-site": "same-origin", ...(body === undefined ? {} : { "content-type": "application/json" }) },
  });
}

describe("extension tokens", () => {
  it("needs a signed-in user", async () => {
    const { deps } = setup(null);
    expect((await extTokens(deps).GET(req("GET"))).status).toBe(401);
    expect((await extTokens(deps).POST(req("POST", { label: "x", campaignId: EMBER }))).status).toBe(401);
  });

  it("creates a token, shows it once, and lists it without the secret", async () => {
    const { deps } = setup();
    const created = await extTokens(deps).POST(req("POST", { label: "laptop", campaignId: EMBER }));
    expect(created.status).toBe(201);
    const { token } = (await created.json()) as { id: string; token: string };
    expect(token.startsWith("ptx_")).toBe(true);
    const listed = (await (await extTokens(deps).GET(req("GET"))).json()) as { tokens: unknown[]; campaigns: { id: string }[]; synced: unknown[] };
    expect(listed.tokens).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(token);
    expect(listed.campaigns.map((c) => c.id)).toEqual([EMBER]);
    expect(listed.synced).toEqual([]);
  });

  it("refuses a campaign the player does not play in", async () => {
    const { deps } = setup();
    expect((await extTokens(deps).POST(req("POST", { label: "laptop", campaignId: FROST }))).status).toBe(403);
    expect((await extTokens(deps).POST(req("POST", { label: "", campaignId: EMBER }))).status).toBe(400);
  });

  it("stops at five tokens", async () => {
    const { deps } = setup();
    for (let i = 0; i < 5; i++) expect((await extTokens(deps).POST(req("POST", { label: `t${i}`, campaignId: EMBER }))).status).toBe(201);
    expect((await extTokens(deps).POST(req("POST", { label: "sixth", campaignId: EMBER }))).status).toBe(409);
  });

  it("revokes only the caller's own token", async () => {
    const { db, deps } = setup();
    const mine = (await (await extTokens(deps).POST(req("POST", { label: "mine", campaignId: EMBER }))).json()) as { id: string };
    const theirs = new ExtTokenRepo(db).issue(BRAM, EMBER, "bram");
    expect((await extTokenItem(deps).DELETE(req("DELETE"), theirs.id)).status).toBe(404);
    expect((await extTokenItem(deps).DELETE(req("DELETE"), mine.id)).status).toBe(204);
    expect(new ExtTokenRepo(db).verify(theirs.token)).not.toBeNull();
  });

  it("reports each synced character with its last sync and error", async () => {
    const { db, deps } = setup();
    const sheet = new SheetRepo(db).create({ campaignId: EMBER, ownerUserId: ARIA, edition: "2024", name: "Aria" });
    if (sheet === "limit") throw new Error("limit");
    const links = new DdbLinkRepo(db);
    links.create(sheet.id, ARIA, "42", "2026-11-22T10:00:00.000Z");
    links.setError(sheet.id, "unreadable");
    const listed = (await (await extTokens(deps).GET(req("GET"))).json()) as { synced: { sheetId: string; lastError: string | null }[] };
    expect(listed.synced).toMatchObject([{ sheetId: sheet.id, lastError: "unreadable" }]);
  });
});
