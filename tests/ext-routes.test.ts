import { describe, expect, it } from "vitest";
import caster from "./fixtures/ddb/caster.json";
import fighter from "./fixtures/ddb/fighter.json";
import { UserRepo } from "@/lib/access/grants";
import { DdbLinkRepo } from "@/lib/ddb/links";
import { openDatabase } from "@/lib/dm/db";
import { ExtTokenRepo } from "@/lib/ext/tokens";
import { extLive, extPing, extRolls, extSheetLocation, extSync, extWrites, type ExtDeps } from "@/lib/ext/routes";
import { RateLimiter } from "@/lib/rateLimit";
import { SheetRepo } from "@/lib/sheets/repo";
import { TableRollRepo } from "@/lib/play/tableRolls";

const ARIA = "100000000000000002";
const EMBER = "aaaaaaaaaaaa";
const T0 = "2026-11-22T10:00:00.000Z";
const T1 = "2026-11-22T10:00:15.000Z";

function setup() {
  const db = openDatabase(":memory:");
  const users = new UserRepo(db);
  users.upsert(ARIA, "Aria", null, []);
  const tokens = new ExtTokenRepo(db);
  const state = { campaigns: [{ id: EMBER, name: "Ember Isles" }] as Array<{ id: string; name: string }> | null };
  const clock = { now: Date.parse(T1) + 1000 };
  const announced: Array<[unknown, string]> = [];
  const names: Array<[string, string, string | null]> = [];
  const deps: ExtDeps = {
    tokens: () => tokens,
    links: () => new DdbLinkRepo(db),
    sheets: () => new SheetRepo(db),
    users: () => users,
    campaignsOf: async () => state.campaigns,
    limiter: new RateLimiter(),
    tableRolls: () => new TableRollRepo(db),
    rollLimiter: new RateLimiter(),
    syncLimiter: new RateLimiter(),
    badTokenLimiter: new RateLimiter(),
    now: () => clock.now,
    syncName: async (campaignId, userId, name) => {
      names.push([campaignId, userId, name]);
      return true;
    },
    announce: async (roll, userId) => {
      announced.push([roll, userId]);
      return true;
    },
  };
  // A token made before several campaigns were supported is tied to one; a new one is not.
  const { token } = tokens.issue(ARIA, EMBER, "laptop");
  const anyToken = tokens.issue(ARIA, "", "any campaign").token;
  return { db, deps, tokens, token, anyToken, state, announced, names, clock };
}

function post(token: string | null, body: unknown, path = "sheets/sync") {
  return new Request(`https://portal.example/api/ext/${path}`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
}

const payload = (character: unknown, extra: Record<string, unknown> = {}) => ({ ddbCharacterId: "100000002", capturedAt: T0, readOnly: false, character, ...extra });

describe("bearer token", () => {
  it("slows down a client that keeps sending wrong tokens, without blocking real ones", async () => {
    const { deps, token } = setup();
    const bad = () => new Request("https://portal.example/api/ext/ping", { headers: { authorization: "Bearer ptx_" + "a".repeat(43), "x-forwarded-for": "203.0.113.9" } });
    for (let i = 0; i < 30; i++) expect((await extPing(deps).GET(bad())).status).toBe(401);
    expect((await extPing(deps).GET(bad())).status).toBe(429);
    const real = new Request("https://portal.example/api/ext/ping", { headers: { authorization: "Bearer " + token, "x-forwarded-for": "203.0.113.9" } });
    expect((await extPing(deps).GET(real)).status).toBe(200);
  });

  it("answers 401 without a token, with a wrong one, and after revoking", async () => {
    const { deps, tokens, token } = setup();
    expect((await extPing(deps).GET(new Request("https://portal.example/api/ext/ping"))).status).toBe(401);
    expect((await extSync(deps).POST(post("ptx_wrong", payload(caster)))).status).toBe(401);
    const [info] = tokens.list(ARIA);
    tokens.revoke(ARIA, info.id);
    expect((await extSync(deps).POST(post(token, payload(caster)))).status).toBe(401);
  });

  it("ping tells the extension who it is paired as", async () => {
    const { deps, token } = setup();
    const response = await extPing(deps).GET(new Request("https://portal.example/api/ext/ping", { headers: { authorization: `Bearer ${token}` } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: "Aria", campaignId: EMBER });
  });
});

describe("sheet sync", () => {
  it("creates a synced sheet on first sync, then updates the same one", async () => {
    const { deps, token } = setup();
    const first = await extSync(deps).POST(post(token, payload(caster)));
    expect(first.status).toBe(200);
    const created = (await first.json()) as { sheetId: string; created: boolean; warnings: string[] };
    expect(created.created).toBe(true);
    // The extension links straight to the sheet and shows the HP.
    expect(created).toMatchObject({ campaignId: EMBER, hp: 17, maxHp: 17 });
    const sheets = deps.sheets();
    expect(sheets.isSynced(created.sheetId)).toBe(true);
    const sheet = sheets.get(created.sheetId)!;
    expect(sheet).toMatchObject({ ownerUserId: ARIA, campaignId: EMBER, name: "Aria Test" });
    expect(sheet.vitals.hp).toBe(17);

    const hurt = structuredClone(caster) as typeof caster & { data: { removedHitPoints: number } };
    hurt.data.removedHitPoints = 5;
    const second = await extSync(deps).POST(post(token, payload(hurt, { capturedAt: T1 })));
    const updated = (await second.json()) as { sheetId: string; created: boolean };
    expect(updated).toMatchObject({ sheetId: created.sheetId, created: false });
    expect(updated).toMatchObject({ campaignId: EMBER, hp: 12, maxHp: 17 });
    const after = sheets.get(created.sheetId)!;
    expect(after.vitals.hp).toBe(12);
    expect(after.vitalsVersion).toBe(sheet.vitalsVersion + 1);
  });

  it("refuses a read-only view and creates nothing", async () => {
    const { deps, token, db } = setup();
    const response = await extSync(deps).POST(post(token, payload(caster, { readOnly: true })));
    expect(response.status).toBe(422);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("read_only");
    expect(Number((db.prepare("SELECT COUNT(*) AS n FROM characters").get() as { n: number }).n)).toBe(0);
  });

  it("ignores a push older than the one it already has", async () => {
    const { deps, token } = setup();
    const first = (await (await extSync(deps).POST(post(token, payload(caster, { capturedAt: T1 })))).json()) as { sheetId: string };
    const hurt = structuredClone(caster) as typeof caster & { data: { removedHitPoints: number } };
    hurt.data.removedHitPoints = 9;
    const stale = await extSync(deps).POST(post(token, payload(hurt, { capturedAt: T0 })));
    expect(stale.status).toBe(200);
    expect(await stale.json()).toMatchObject({ ignored: true });
    expect(deps.sheets().get(first.sheetId)!.vitals.hp).toBe(17);
  });

  it("keeps the last good sheet and records the error when D&D Beyond data is unreadable", async () => {
    const { deps, token } = setup();
    const { sheetId } = (await (await extSync(deps).POST(post(token, payload(caster)))).json()) as { sheetId: string };
    const bad = await extSync(deps).POST(post(token, payload({ data: { name: "Aria Test", canEdit: true, classes: [] } }, { capturedAt: T1 })));
    expect(bad.status).toBe(422);
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe("unreadable");
    expect(deps.sheets().get(sheetId)!.vitals.hp).toBe(17);
    expect(deps.links().status(ARIA)[0].lastError).toMatch(/classes/);
  });

  it("refuses a user who no longer plays in the campaign", async () => {
    const { deps, token, state } = setup();
    state.campaigns = [];
    const response = await extSync(deps).POST(post(token, payload(fighter)));
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("not_in_campaign");
  });

  it("validates the body and its size", async () => {
    const { deps, token } = setup();
    expect((await extSync(deps).POST(post(token, { ddbCharacterId: "abc", capturedAt: T0, readOnly: false, character: {} }))).status).toBe(400);
    expect((await extSync(deps).POST(post(token, { ddbCharacterId: "1", capturedAt: "yesterday", readOnly: false, character: {} }))).status).toBe(400);
    // A real character is hundreds of KB: a big one must reach the reader (422 unreadable), not be cut off.
    const big = { ddbCharacterId: "1", capturedAt: T0, readOnly: false, character: { data: { canEdit: true, filler: "x".repeat(2_000_000) } } };
    expect((await extSync(deps).POST(post(token, big))).status).not.toBe(413);
    expect((await extSync(deps).POST(post(token, "x".repeat(4_300_000)))).status).toBe(413);
  });
});

describe("rolls", () => {
  const roll = (extra: Record<string, unknown> = {}) => ({ ddbCharacterId: "100000002", label: "Dagger: to hit", expression: "1d20+4", total: 18, breakdown: "14 + 4", ...extra });

  it("announces a roll of a linked character", async () => {
    const { deps, token, announced } = setup();
    await extSync(deps).POST(post(token, payload(caster)));
    const response = await extRolls(deps).POST(post(token, roll(), "rolls"));
    expect(response.status).toBe(204);
    expect(announced).toEqual([[{ expression: "1d20+4", total: 18, breakdown: "14 + 4", label: "Dagger: to hit" }, ARIA]]);
  });

  it("answers 404 for a character that was never synced and announces nothing", async () => {
    const { deps, token, announced } = setup();
    expect((await extRolls(deps).POST(post(token, roll(), "rolls"))).status).toBe(404);
    expect(announced).toEqual([]);
  });

  it("limits a flood of syncs", async () => {
    const { deps, token } = setup();
    for (let i = 0; i < 20; i++) expect((await extSync(deps).POST(post(token, payload(caster)))).status).toBe(200);
    expect((await extSync(deps).POST(post(token, payload(caster)))).status).toBe(429);
  });

  it("limits a flood of rolls", async () => {
    const { deps, token } = setup();
    await extSync(deps).POST(post(token, payload(caster)));
    for (let i = 0; i < 30; i++) expect((await extRolls(deps).POST(post(token, roll(), "rolls"))).status).toBe(204);
    expect((await extRolls(deps).POST(post(token, roll(), "rolls"))).status).toBe(429);
  });

  it("keeps a D&D Beyond roll in the table's rolls with its visibility: a DM-only one never goes to Discord, a self one goes nowhere", async () => {
    const { deps, token, announced } = setup();
    await extSync(deps).POST(post(token, payload(caster)));
    expect((await extRolls(deps).POST(post(token, roll({ label: "Open" }), "rolls"))).status).toBe(204);
    expect((await extRolls(deps).POST(post(token, roll({ label: "Hidden", visibility: "dm" }), "rolls"))).status).toBe(204);
    expect((await extRolls(deps).POST(post(token, roll({ label: "Mine", visibility: "self" }), "rolls"))).status).toBe(204);
    expect(announced.map(([r]) => (r as { label: string }).label)).toEqual(["Open"]);
    const everyone = deps.tableRolls!().list(EMBER, { userId: "x", seesAll: false });
    expect(everyone.map((r) => [r.label, r.who, r.source, r.visibility])).toEqual([["Open", "Aria Test", "ddb", "everyone"]]);
    expect(deps.tableRolls!().list(EMBER, { userId: "dm", seesAll: true }).map((r) => r.label)).toEqual(["Hidden", "Open"]);
  });

  it("validates the roll", async () => {
    const { deps, token } = setup();
    expect((await extRolls(deps).POST(post(token, roll({ total: "many" }), "rolls"))).status).toBe(400);
    expect((await extRolls(deps).POST(post(token, roll({ label: "x".repeat(81) }), "rolls"))).status).toBe(400);
    expect((await extRolls(deps).POST(post(null, roll(), "rolls"))).status).toBe(401);
  });
});

describe("trust", () => {
  it("does not take the client's word that a page is editable", async () => {
    const { deps, token, db } = setup();
    const viewing = structuredClone(caster) as typeof caster & { data: { canEdit: boolean } };
    viewing.data.canEdit = false;
    const response = await extSync(deps).POST(post(token, payload(viewing)));
    expect(response.status).toBe(422);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("read_only");
    expect(Number((db.prepare("SELECT COUNT(*) AS n FROM characters").get() as { n: number }).n)).toBe(0);
  });

  it("never lets a clock that runs ahead freeze the sync", async () => {
    const { deps, token, clock } = setup();
    const first = (await (await extSync(deps).POST(post(token, payload(caster, { capturedAt: "2099-01-01T00:00:00.000Z" })))).json()) as { sheetId: string };
    expect(deps.links().find(ARIA, "100000002")!.capturedAt <= new Date(Date.parse(T1) + 1000).toISOString()).toBe(true);
    clock.now += 10_000;
    const hurt = structuredClone(caster) as typeof caster & { data: { removedHitPoints: number } };
    hurt.data.removedHitPoints = 7;
    const next = await extSync(deps).POST(post(token, payload(hurt, { capturedAt: new Date(Date.parse(T1) + 5000).toISOString() })));
    expect(((await next.json()) as { ignored?: boolean }).ignored).toBeUndefined();
    expect(deps.sheets().get(first.sheetId)!.vitals.hp).toBe(10);
  });

  it("tells the bot the character name when a sheet is made and when it changes", async () => {
    const { deps, token, names } = setup();
    await extSync(deps).POST(post(token, payload(caster)));
    expect(names).toEqual([[EMBER, ARIA, "Aria Test"]]);
    const renamed = structuredClone(caster) as typeof caster & { data: { name: string } };
    renamed.data.name = "Aria Moonwhisper";
    await extSync(deps).POST(post(token, payload(renamed, { capturedAt: T1 })));
    expect(names.at(-1)).toEqual([EMBER, ARIA, "Aria Moonwhisper"]);
  });
});

describe("which campaign a synced character lands in", () => {
  const TYR = "bbbbbbbbbbbb";
  const campaigns = [
    { id: EMBER, name: "Ember Isles" },
    { id: TYR, name: "Tyranny of Dragons" },
  ];
  const inCampaign = (name: string, id = "8266155") => {
    const raw = structuredClone(caster) as { data: Record<string, unknown> };
    raw.data.campaign = { id: Number(id), name };
    return raw;
  };
  const codeOf = async (response: Response) => ((await response.json()) as { error: { code: string } }).error.code;

  it("puts a character in the one campaign a token-less-of-campaign player plays in", async () => {
    const { deps, anyToken } = setup();
    const { sheetId } = (await (await extSync(deps).POST(post(anyToken, payload(caster)))).json()) as { sheetId: string };
    expect(deps.sheets().get(sheetId)!.campaignId).toBe(EMBER);
    expect(deps.links().mappedCampaign(ARIA, "none")).toBe(EMBER);
  });

  it("matches the D&D Beyond campaign name to a portal campaign and remembers it", async () => {
    const { deps, anyToken, state } = setup();
    state.campaigns = campaigns;
    const response = await extSync(deps).POST(post(anyToken, payload(inCampaign("tyranny of dragons"))));
    const { sheetId } = (await response.json()) as { sheetId: string };
    expect(deps.sheets().get(sheetId)!.campaignId).toBe(TYR);
    expect(deps.links().mappedCampaign(ARIA, "8266155")).toBe(TYR);
    expect(deps.links().status(ARIA)[0]).toMatchObject({ ddbCampaignId: "8266155", ddbCampaignName: "tyranny of dragons", campaignId: TYR });
  });

  it("asks when it cannot tell, creates nothing, and lists the character as waiting", async () => {
    const { deps, anyToken, state, db } = setup();
    state.campaigns = campaigns;
    const response = await extSync(deps).POST(post(anyToken, payload(inCampaign("Some other table", "99"))));
    expect(response.status).toBe(409);
    expect(await codeOf(response)).toBe("needs_campaign");
    expect(Number((db.prepare("SELECT COUNT(*) AS n FROM characters").get() as { n: number }).n)).toBe(0);
    expect(deps.links().pending(ARIA)).toMatchObject([{ ddbCharacterId: "100000002", name: "Aria Test", ddbCampaignId: "99", ddbCampaignName: "Some other table" }]);
  });

  it("creates the sheet once the player has chosen, and stops listing it as waiting", async () => {
    const { deps, anyToken, state } = setup();
    state.campaigns = campaigns;
    await extSync(deps).POST(post(anyToken, payload(inCampaign("Some other table", "99"))));
    deps.links().mapCampaign(ARIA, "99", TYR);
    const { sheetId } = (await (await extSync(deps).POST(post(anyToken, payload(inCampaign("Some other table", "99"), { capturedAt: T1 })))).json()) as { sheetId: string };
    expect(deps.sheets().get(sheetId)!.campaignId).toBe(TYR);
    expect(deps.links().pending(ARIA)).toEqual([]);
  });

  it("moves the sheet when the player changes the campaign, and tells the bot about both", async () => {
    const { deps, anyToken, state, names } = setup();
    state.campaigns = campaigns;
    const { sheetId } = (await (await extSync(deps).POST(post(anyToken, payload(inCampaign("Ember Isles"))))).json()) as { sheetId: string };
    expect(deps.sheets().get(sheetId)!.campaignId).toBe(EMBER);
    names.length = 0;
    deps.links().mapCampaign(ARIA, "8266155", TYR);
    const answer = await extSync(deps).POST(post(anyToken, payload(inCampaign("Ember Isles"), { capturedAt: T1 })));
    expect(answer.status).toBe(200);
    expect(deps.sheets().get(sheetId)!.campaignId).toBe(TYR);
    expect(deps.sheets().isSynced(sheetId)).toBe(true);
    expect(names.map(([campaign]) => campaign).sort()).toEqual([EMBER, TYR].sort());
  });

  it("does not ask again, or move anything, for a character that already has a sheet", async () => {
    const { deps, anyToken, state } = setup();
    const { sheetId } = (await (await extSync(deps).POST(post(anyToken, payload(inCampaign("Ember Isles"))))).json()) as { sheetId: string };
    state.campaigns = campaigns;
    deps.links().mapCampaign(ARIA, "8266155", "gone");
    const answer = await extSync(deps).POST(post(anyToken, payload(inCampaign("Unmatched", "8266155"), { capturedAt: T1 })));
    expect(answer.status).toBe(200);
    expect(deps.sheets().get(sheetId)!.campaignId).toBe(EMBER);
  });

  it("when the bot cannot say which campaigns the player plays in, a new character waits and a synced one keeps syncing", async () => {
    const { deps, anyToken, state } = setup();
    state.campaigns = null;
    const fresh = await extSync(deps).POST(post(anyToken, payload(caster)));
    expect(fresh.status).toBe(503);
    expect(await codeOf(fresh)).toBe("bot_unavailable");
    state.campaigns = campaigns;
    const { sheetId } = (await (await extSync(deps).POST(post(anyToken, payload(inCampaign("Ember Isles"))))).json()) as { sheetId: string };
    state.campaigns = null;
    const again = await extSync(deps).POST(post(anyToken, payload(inCampaign("Ember Isles"), { capturedAt: T1 })));
    expect(again.status).toBe(200);
    expect(deps.sheets().get(sheetId)!.campaignId).toBe(EMBER);
  });

  it("keeps a token that was made for one campaign inside that campaign", async () => {
    const { deps, token, state } = setup();
    state.campaigns = campaigns;
    const { sheetId } = (await (await extSync(deps).POST(post(token, payload(inCampaign("Tyranny of Dragons"))))).json()) as { sheetId: string };
    expect(deps.sheets().get(sheetId)!.campaignId).toBe(EMBER);
  });
});

describe("live switch", () => {
  const put = (token: string | null, body: unknown) =>
    new Request("https://portal.example/api/ext/live", {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });

  it("needs a token", async () => {
    const { deps } = setup();
    expect((await extLive(deps).PUT(put(null, { live: true }))).status).toBe(401);
  });

  it("marks the token's owner live, and not live", async () => {
    const { deps, token } = setup();
    expect((await extLive(deps).PUT(put(token, { live: true }))).status).toBe(204);
    expect(deps.links().isLive(ARIA, new Date(deps.now?.() ?? Date.now()).toISOString())).toBe(true);
    expect((await extLive(deps).PUT(put(token, { live: false }))).status).toBe(204);
    expect(deps.links().isLive(ARIA, new Date(deps.now?.() ?? Date.now()).toISOString())).toBe(false);
  });

  it("refuses anything but { live: boolean }", async () => {
    const { deps, token } = setup();
    expect((await extLive(deps).PUT(put(token, { live: "yes" }))).status).toBe(400);
    expect((await extLive(deps).PUT(put(token, { live: true, extra: 1 }))).status).toBe(400);
  });
});

describe("where a D&D Beyond character's sheet is", () => {
  const BRAM = "100000000000000003";
  const ask = (token: string, id: string) => new Request(`https://portal.example/api/ext/sheet?ddbCharacterId=${id}`, { headers: { authorization: `Bearer ${token}` } });

  it("tells the owner and anyone playing in that campaign, so the extension opens the right sheet", async () => {
    const { deps, token, tokens } = setup();
    const { sheetId } = (await (await extSync(deps).POST(post(token, payload(caster)))).json()) as { sheetId: string };
    expect(await (await extSheetLocation(deps).GET(ask(token, "100000002"))).json()).toEqual({ campaignId: EMBER, sheetId });
    const friend = tokens.issue(BRAM, "", "friend").token;
    expect(await (await extSheetLocation(deps).GET(ask(friend, "100000002"))).json()).toEqual({ campaignId: EMBER, sheetId });
  });

  it("answers 404 for a character nobody synced, or one in a campaign the asker does not play in", async () => {
    const { deps, token, tokens, state } = setup();
    await extSync(deps).POST(post(token, payload(caster)));
    const friend = tokens.issue(BRAM, "", "friend").token;
    expect((await extSheetLocation(deps).GET(ask(friend, "999"))).status).toBe(404);
    state.campaigns = [{ id: "bbbbbbbbbbbb", name: "Other table" }];
    expect((await extSheetLocation(deps).GET(ask(friend, "100000002"))).status).toBe(404);
    // Without the bot's list only your own characters can be found.
    state.campaigns = null;
    expect((await extSheetLocation(deps).GET(ask(friend, "100000002"))).status).toBe(404);
    expect((await extSheetLocation(deps).GET(ask(token, "100000002"))).status).toBe(200);
  });

  it("needs a token and a numeric id", async () => {
    const { deps, token } = setup();
    expect((await extSheetLocation(deps).GET(new Request("https://portal.example/api/ext/sheet?ddbCharacterId=1"))).status).toBe(401);
    expect((await extSheetLocation(deps).GET(ask(token, "abc"))).status).toBe(400);
  });
});

describe("two-way HP", () => {
  const T2 = "2026-11-22T10:00:30.000Z";
  const want = { hp: 5, tempHp: 0, removed: 12, successes: 0, failures: 0 };
  const listing = (token: string) => new Request("https://portal.example/api/ext/writes", { headers: { authorization: `Bearer ${token}` } });

  async function synced() {
    const ctx = setup();
    const { sheetId } = (await (await extSync(ctx.deps).POST(post(ctx.token, payload(caster)))).json()) as { sheetId: string };
    ctx.deps.links().queueWrite(sheetId, want, new Date(ctx.clock.now).toISOString());
    return { ...ctx, sheetId };
  }

  it("lists the HP changes the player's extension should save on D&D Beyond", async () => {
    const { deps, token } = await synced();
    const response = await extWrites(deps).GET(listing(token));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ writes: [{ ddbCharacterId: "100000002", ...want }] });
  });

  it("keeps the portal's HP while D&D Beyond does not have it yet", async () => {
    const { deps, token, sheetId, clock } = await synced();
    clock.now = Date.parse(T2) + 1000;
    const answer = (await (await extSync(deps).POST(post(token, payload(caster, { capturedAt: T2 })))).json()) as { hp: number };
    expect(deps.sheets().get(sheetId)!.vitals.hp).toBe(5);
    expect(answer.hp).toBe(5);
    expect(deps.links().writeFor(sheetId, clock.now)).not.toBeNull();
  });

  it("forgets the change once D&D Beyond holds it", async () => {
    const { deps, token, sheetId, clock } = await synced();
    clock.now = Date.parse(T2) + 1000;
    const saved = structuredClone(caster) as typeof caster & { data: { removedHitPoints: number } };
    saved.data.removedHitPoints = 12;
    await extSync(deps).POST(post(token, payload(saved, { capturedAt: T2 })));
    expect(deps.sheets().get(sheetId)!.vitals.hp).toBe(5);
    expect(deps.links().writeFor(sheetId, clock.now)).toBeNull();
    expect(await (await extWrites(deps).GET(listing(token))).json()).toEqual({ writes: [] });
  });

  it("needs a token", async () => {
    const { deps } = setup();
    expect((await extWrites(deps).GET(new Request("https://portal.example/api/ext/writes"))).status).toBe(401);
  });
});
