import { describe, expect, it } from "vitest";
import { DdbLinkRepo } from "@/lib/ddb/links";
import { openDatabase } from "@/lib/dm/db";
import { extCampaignChoice, extTokenItem, extTokens } from "@/lib/ext/tokenRoutes";
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
  const names: Array<[string, string]> = [];
  const getAccess = user ? grantedAccess(user, [ROLE], [{ roleId: ROLE, permissions: ["play"], scope: [EMBER] }]) : async () => null;
  const deps = {
    getAccess,
    limiter: new RateLimiter(),
    tokens: () => new ExtTokenRepo(db),
    links: () => new DdbLinkRepo(db),
    sheets: () => new SheetRepo(db),
    syncName: async (campaignId: string, userId: string) => {
      names.push([campaignId, userId]);
      return true;
    },
    campaigns: async () => [
      { id: EMBER, name: "Ember" },
      { id: FROST, name: "Frost" },
    ],
  };
  return { db, deps, names };
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
    expect((await extTokens(deps).POST(req("POST", { label: "x" }))).status).toBe(401);
  });

  it("creates a token, shows it once, and lists it without the secret", async () => {
    const { deps } = setup();
    const created = await extTokens(deps).POST(req("POST", { label: "laptop" }));
    expect(created.status).toBe(201);
    const { token } = (await created.json()) as { id: string; token: string };
    expect(token.startsWith("ptx_")).toBe(true);
    const listed = (await (await extTokens(deps).GET(req("GET"))).json()) as { tokens: unknown[]; campaigns: { id: string }[]; synced: unknown[] };
    expect(listed.tokens).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(token);
    expect(listed.campaigns.map((c) => c.id)).toEqual([EMBER]);
    expect(listed.synced).toEqual([]);
    expect((listed as unknown as { pending: unknown[] }).pending).toEqual([]);
  });

  it("makes a token that works in every campaign, whatever a stale page sends", async () => {
    const { db, deps } = setup();
    const created = (await (await extTokens(deps).POST(req("POST", { label: "laptop", campaignId: FROST }))).json()) as { token: string };
    expect(new ExtTokenRepo(db).verify(created.token)).toMatchObject({ userId: ARIA, campaignId: "" });
    expect((await extTokens(deps).POST(req("POST", { label: "" }))).status).toBe(400);
    expect((await extTokens(deps).POST(req("POST", { label: "x", extra: 1 }))).status).toBe(400);
  });

  it("stops at five tokens", async () => {
    const { deps } = setup();
    for (let i = 0; i < 5; i++) expect((await extTokens(deps).POST(req("POST", { label: `t${i}` }))).status).toBe(201);
    expect((await extTokens(deps).POST(req("POST", { label: "sixth" }))).status).toBe(409);
  });

  it("revokes only the caller's own token", async () => {
    const { db, deps } = setup();
    const mine = (await (await extTokens(deps).POST(req("POST", { label: "mine" }))).json()) as { id: string };
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

describe("choosing the portal campaign for a D&D Beyond campaign", () => {
  const choose = (body: unknown) =>
    new Request("https://portal.example/api/dm/ext/campaign", {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { "x-portal-request": "1", "sec-fetch-site": "same-origin", "content-type": "application/json" },
    });

  it("needs a signed-in user and a campaign the player plays in", async () => {
    expect((await extCampaignChoice(setup(null).deps).PUT(choose({ ddbCampaignId: "1", campaignId: EMBER }))).status).toBe(401);
    const { deps } = setup();
    expect((await extCampaignChoice(deps).PUT(choose({ ddbCampaignId: "1", campaignId: FROST }))).status).toBe(403);
    expect((await extCampaignChoice(deps).PUT(choose({ ddbCampaignId: "", campaignId: EMBER }))).status).toBe(400);
    expect((await extCampaignChoice(deps).PUT(choose({ ddbCampaignId: "1", campaignId: EMBER, more: true }))).status).toBe(400);
  });

  it("remembers the choice, forgets the waiting characters of that campaign, and moves the synced sheets of this player only", async () => {
    const { db, deps, names } = setup();
    const sheets = new SheetRepo(db);
    const links = new DdbLinkRepo(db);
    const mine = sheets.create({ campaignId: FROST, ownerUserId: ARIA, edition: "2024", name: "Mine" });
    const theirs = sheets.create({ campaignId: FROST, ownerUserId: BRAM, edition: "2024", name: "Theirs" });
    if (mine === "limit" || theirs === "limit") throw new Error("limit");
    links.create(mine.id, ARIA, "42", "2026-11-22T10:00:00.000Z", { id: "8266155", name: "Tyranny" });
    links.create(theirs.id, BRAM, "43", "2026-11-22T10:00:00.000Z", { id: "8266155", name: "Tyranny" });
    links.setPending(ARIA, "44", "Waiting", { id: "8266155", name: "Tyranny" }, "2026-11-22T10:00:00.000Z");
    links.setPending(ARIA, "45", "Elsewhere", { id: "7", name: "Other" }, "2026-11-22T10:00:00.000Z");

    const response = await extCampaignChoice(deps).PUT(choose({ ddbCampaignId: "8266155", campaignId: EMBER }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ moved: 1 });
    expect(links.mappedCampaign(ARIA, "8266155")).toBe(EMBER);
    expect(sheets.get(mine.id)!.campaignId).toBe(EMBER);
    expect(sheets.get(theirs.id)!.campaignId).toBe(FROST);
    expect(links.pending(ARIA).map((p) => p.ddbCharacterId)).toEqual(["45"]);
    expect(names.map(([campaign]) => campaign).sort()).toEqual([EMBER, FROST].sort());
  });
});
