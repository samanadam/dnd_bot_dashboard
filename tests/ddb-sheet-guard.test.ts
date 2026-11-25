import { describe, expect, it } from "vitest";
import { UserRepo } from "@/lib/access/grants";
import { resolveAccess, type Grant } from "@/lib/access/permissions";
import { DdbLinkRepo } from "@/lib/ddb/links";
import { openDatabase } from "@/lib/dm/db";
import { FeatRepo } from "@/lib/dm/feats";
import { SpellRepo } from "@/lib/dm/spells";
import { RateLimiter } from "@/lib/rateLimit";
import { newBody } from "@/lib/sheets/body";
import { SheetRepo } from "@/lib/sheets/repo";
import { sheetItem, sheetMeta, sheetOps } from "@/lib/sheets/routes";

const OWNER = "100000000000000001";
const ARIA = "100000000000000002";
const EMBER = "aaaaaaaaaaaa";
const R_EMBER = "200000000000000001";
const GRANTS: Grant[] = [{ roleId: R_EMBER, permissions: ["play"], scope: [EMBER] }];

function setup() {
  const db = openDatabase(":memory:");
  const users = new UserRepo(db);
  users.upsert(ARIA, "Aria", null, [R_EMBER]);
  users.upsert(OWNER, "Owner", null, []);
  let as = ARIA;
  const deps = {
    getAccess: async () => resolveAccess(as, as === ARIA ? [R_EMBER] : [], [OWNER], GRANTS),
    limiter: new RateLimiter(),
    rollLimiter: new RateLimiter(),
    sheets: () => new SheetRepo(db),
    users: () => users,
    spells: () => new SpellRepo(db),
    feats: () => new FeatRepo(db),
    srdSpells: () => ({ list: () => [], get: () => null }),
    srdFeats: () => ({ list: () => [], get: () => null }),
    campaignIds: async () => new Set([EMBER]),
    links: () => new DdbLinkRepo(db),
  };
  const repo = new SheetRepo(db);
  const plain = repo.create({ campaignId: EMBER, ownerUserId: ARIA, edition: "2024", name: "Plain" });
  const synced = repo.create({ campaignId: EMBER, ownerUserId: ARIA, edition: "2024", name: "Synced" });
  if (plain === "limit" || synced === "limit") throw new Error("limit");
  new DdbLinkRepo(db).create(synced.id, ARIA, "42", "2026-11-22T10:00:00.000Z");
  return { deps, plain, synced, links: new DdbLinkRepo(db), as: (user: string) => (as = user) };
}

const req = (method: string, body?: unknown) =>
  new Request("https://portal.example/api/sheets/x", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "x-portal-request": "1", "sec-fetch-site": "same-origin", ...(body === undefined ? {} : { "content-type": "application/json" }) },
  });

describe("synced sheets", () => {
  it("refuses a body save with 409 synced", async () => {
    const { deps, synced } = setup();
    const response = await sheetItem(deps).PUT(req("PUT", { version: synced.version, body: newBody("Hacked") }), synced.id);
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("synced");
  });

  it("takes HP changes and keeps them for the owner's extension to save on D&D Beyond", async () => {
    const { deps, synced, links, as } = setup();
    as(OWNER);
    const response = await sheetOps(deps).POST(req("POST", { ops: [{ op: "damage", amount: 3 }] }), synced.id);
    expect(response.status).toBe(200);
    const { vitals } = (await response.json()) as { vitals: { hp: number } };
    const want = links.writeFor(synced.id, Date.now())!;
    expect(want).toMatchObject({ hp: vitals.hp, tempHp: 0, removed: 3, successes: 0, failures: 0 });
    expect(links.pendingWrites(ARIA, Date.now())).toHaveLength(1);
  });

  it("refuses every other live change with 409 synced, and queues nothing", async () => {
    const { deps, synced, links } = setup();
    for (const ops of [[{ op: "addCondition", name: "Prone", rounds: null }], [{ op: "damage", amount: 1 }, { op: "inspiration", value: true }], [{ op: "spendSlot", level: 1 }]]) {
      const response = await sheetOps(deps).POST(req("POST", { ops }), synced.id);
      expect(response.status).toBe(409);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe("synced");
    }
    expect(links.writeFor(synced.id, Date.now())).toBeNull();
  });

  it("still lets the DM keep notes on a synced sheet", async () => {
    const { deps, synced, as } = setup();
    as(OWNER);
    const response = await sheetMeta(deps).PATCH(req("PATCH", { dmNotes: "keep an eye on her" }), synced.id);
    expect(response.status).toBe(200);
  });

  it("marks the sheet in its view", async () => {
    const { deps, synced, plain } = setup();
    expect(((await (await sheetItem(deps).GET(req("GET"), synced.id)).json()) as { synced: boolean }).synced).toBe(true);
    expect(((await (await sheetItem(deps).GET(req("GET"), plain.id)).json()) as { synced: boolean }).synced).toBe(false);
  });

  it("leaves ordinary sheets editable", async () => {
    const { deps, plain } = setup();
    const response = await sheetOps(deps).POST(req("POST", { ops: [{ op: "damage", amount: 1 }] }), plain.id);
    expect(response.status).toBe(200);
  });
});
