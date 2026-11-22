import { describe, expect, it } from "vitest";
import caster from "./fixtures/ddb/caster.json";
import fighter from "./fixtures/ddb/fighter.json";
import { UserRepo } from "@/lib/access/grants";
import { DdbLinkRepo } from "@/lib/ddb/links";
import { openDatabase } from "@/lib/dm/db";
import { ExtTokenRepo } from "@/lib/ext/tokens";
import { extPing, extSync, type ExtDeps } from "@/lib/ext/routes";
import { RateLimiter } from "@/lib/rateLimit";
import { SheetRepo } from "@/lib/sheets/repo";

const ARIA = "100000000000000002";
const EMBER = "aaaaaaaaaaaa";
const T0 = "2026-11-22T10:00:00.000Z";
const T1 = "2026-11-22T10:00:15.000Z";

function setup() {
  const db = openDatabase(":memory:");
  const users = new UserRepo(db);
  users.upsert(ARIA, "Aria", null, []);
  const tokens = new ExtTokenRepo(db);
  const state = { plays: true };
  const deps: ExtDeps = {
    tokens: () => tokens,
    links: () => new DdbLinkRepo(db),
    sheets: () => new SheetRepo(db),
    users: () => users,
    playsIn: async () => state.plays,
    limiter: new RateLimiter(),
  };
  const { token } = tokens.issue(ARIA, EMBER, "laptop");
  return { db, deps, tokens, token, state };
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
    const bad = await extSync(deps).POST(post(token, payload({ data: { name: "Aria Test", classes: [] } }, { capturedAt: T1 })));
    expect(bad.status).toBe(422);
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe("unreadable");
    expect(deps.sheets().get(sheetId)!.vitals.hp).toBe(17);
    expect(deps.links().status(ARIA)[0].lastError).toMatch(/classes/);
  });

  it("refuses a user who no longer plays in the campaign", async () => {
    const { deps, token, state } = setup();
    state.plays = false;
    const response = await extSync(deps).POST(post(token, payload(fighter)));
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("not_in_campaign");
  });

  it("validates the body and its size", async () => {
    const { deps, token } = setup();
    expect((await extSync(deps).POST(post(token, { ddbCharacterId: "abc", capturedAt: T0, readOnly: false, character: {} }))).status).toBe(400);
    expect((await extSync(deps).POST(post(token, { ddbCharacterId: "1", capturedAt: "yesterday", readOnly: false, character: {} }))).status).toBe(400);
    expect((await extSync(deps).POST(post(token, "x".repeat(1_100_000)))).status).toBe(413);
  });
});
