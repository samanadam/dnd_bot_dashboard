import { describe, expect, it } from "vitest";
import { resolveAccess, type Grant } from "@/lib/access/permissions";
import { openDatabase } from "@/lib/dm/db";
import { tableRollFeed } from "@/lib/play/rollRoutes";
import { TableRollRepo } from "@/lib/play/tableRolls";
import { RateLimiter } from "@/lib/rateLimit";

const OWNER = "100000000000000001";
const ARIA = "100000000000000002";
const BRAM = "100000000000000003";
const EMBER = "aaaaaaaaaaaa";
const R_PLAY = "200000000000000001";
const GRANTS: Grant[] = [{ roleId: R_PLAY, permissions: ["play"], scope: [EMBER] }];

function setup() {
  const db = openDatabase(":memory:");
  const repo = new TableRollRepo(db);
  let as: string | null = ARIA;
  const deps = {
    getAccess: async () => (as ? resolveAccess(as, as === OWNER ? [] : [R_PLAY], [OWNER], GRANTS) : null),
    limiter: new RateLimiter(),
    tableRolls: () => repo,
  };
  const base = { campaignId: EMBER, sheetId: null, who: "Auren", expression: "1d20", total: 12, breakdown: "12", source: "portal" as const };
  repo.add({ ...base, userId: ARIA, label: "Open", visibility: "everyone" });
  repo.add({ ...base, userId: OWNER, who: "DM", label: "Goblin attack", visibility: "dm" });
  repo.add({ ...base, userId: ARIA, label: "My secret", visibility: "dm" });
  return { deps, as: (user: string | null) => (as = user) };
}

const get = (campaign: string) => new Request(`https://portal.example/api/play/rolls?campaign=${campaign}`, { headers: { "sec-fetch-site": "same-origin", "x-portal-request": "1" } });
const labels = async (response: Response) => ((await response.json()) as { rolls: Array<{ label: string }> }).rolls.map((r) => r.label);

describe("the table's rolls", () => {
  it("shows a player the rolls to everyone and their own DM-only ones", async () => {
    const { deps } = setup();
    expect(await labels(await tableRollFeed(deps).GET(get(EMBER)))).toEqual(["My secret", "Open"]);
  });

  it("hides another player's DM-only rolls and the DM's", async () => {
    const { deps, as } = setup();
    as(BRAM);
    expect(await labels(await tableRollFeed(deps).GET(get(EMBER)))).toEqual(["Open"]);
  });

  it("shows the DM everything", async () => {
    const { deps, as } = setup();
    as(OWNER);
    expect(await labels(await tableRollFeed(deps).GET(get(EMBER)))).toEqual(["My secret", "Goblin attack", "Open"]);
  });

  it("answers 404 for a campaign the viewer does not play in, and 401 when signed out", async () => {
    const { deps, as } = setup();
    expect((await tableRollFeed(deps).GET(get("bbbbbbbbbbbb"))).status).toBe(404);
    as(null);
    expect((await tableRollFeed(deps).GET(get(EMBER))).status).toBe(401);
  });
});
