import { describe, expect, it } from "vitest";
import { SettingsRepo, UserRepo } from "@/lib/access/grants";
import { AvailabilityRepo, CAMPAIGN } from "@/lib/availability/repo";
import { availabilityCollection, availabilityPlayers, availabilityTest } from "@/lib/availability/routes";
import type { Nudge } from "@/lib/availability/notify";
import { openDatabase } from "@/lib/dm/db";
import { RateLimiter } from "@/lib/rateLimit";
import { grantedAccess, ownerAccess } from "./helpers/access";

const OWNER = "111111111111111111";
const P1 = "222222222222222222";
const P2 = "333333333333333333";
const OUTSIDER = "444444444444444444";
const ROLE = "555555555555555555";
const NOW = new Date("2026-11-20T10:00:00Z"); // 2026-11-20 in Istanbul
const BASE = "https://portal.example/api/dm/availability";

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

function setup(user: string | null = P1, notify: "ok" | "off" | "fail" = "ok") {
  const db = openDatabase(":memory:");
  const users = new UserRepo(db);
  for (const [id, name] of [[OWNER, "Dungeon Master"], [P1, "Ann"], [P2, "Bo"], [OUTSIDER, "Cy"]]) users.upsert(id, name, null, []);
  const sent: Nudge[] = [];
  const logs: unknown[] = [];
  const getAccess =
    user === OWNER || user === null
      ? ownerAccess(user, [OWNER])
      : grantedAccess(user, [ROLE], [{ roleId: ROLE, permissions: ["play"], scope: "all" }]);
  const deps = {
    getAccess,
    limiter: new RateLimiter(),
    repo: () => new AvailabilityRepo(db),
    users: () => users.list(),
    settings: () => new SettingsRepo(db),
    notify: () =>
      notify === "off"
        ? null
        : async (nudge: Nudge) => {
            if (notify === "fail") throw new Error("telegram down");
            sent.push(nudge);
          },
    now: () => NOW,
    log: (entry: unknown) => logs.push(entry),
  };
  return { db, deps, sent, logs, repo: new AvailabilityRepo(db) };
}

const put = (deps: ReturnType<typeof setup>["deps"], days: string[]) => availabilityCollection(deps).PUT(req("PUT", "", { days }));

describe("availability routes", () => {
  it("hides the calendar from users without the play permission", async () => {
    const { deps } = setup(null);
    expect((await availabilityCollection(deps).GET(req("GET", ""))).status).toBe(401);
    const none = setup(P1);
    none.deps.getAccess = async () => null;
    expect((await availabilityCollection(none.deps).GET(req("GET", ""))).status).toBe(401);
    const operator = setup(P1);
    operator.deps.getAccess = grantedAccess(P1, [ROLE], [{ roleId: ROLE, permissions: ["bot.view"], scope: "all" }]);
    expect((await availabilityCollection(operator.deps).GET(req("GET", ""))).status).toBe(404);
    expect((await put(operator.deps, ["2026-11-28"])).status).toBe(404);
  });

  it("shows own days, counts only listed players, and names who is free to every player", async () => {
    const { deps, repo } = setup(P1);
    repo.setPlayers(CAMPAIGN, [P1, P2]);
    repo.setFreeDays(CAMPAIGN, P1, ["2026-11-28"], "2026-11-20");
    repo.setFreeDays(CAMPAIGN, P2, ["2026-11-28", "2026-11-29"], "2026-11-20");
    repo.setFreeDays(CAMPAIGN, OUTSIDER, ["2026-11-28"], "2026-11-20");
    const body = await (await availabilityCollection(deps).GET(req("GET", ""))).json();
    expect(body.today).toBe("2026-11-20");
    expect(body.days).toHaveLength(56);
    expect(body.mine).toEqual(["2026-11-28"]);
    expect(body.counts["2026-11-28"]).toBe(2);
    expect(body.counts["2026-11-29"]).toBe(1);
    expect(body.total).toBe(2);
    expect(body.players.sort()).toEqual(["Ann", "Bo"]);
    expect(body.who["2026-11-28"].sort()).toEqual(["Ann", "Bo"]);
    // The outsider is not on the list, so never named.
    expect(body.who["2026-11-29"]).toEqual(["Bo"]);

    const owner = setup(OWNER);
    owner.repo.setPlayers(CAMPAIGN, [P1, P2]);
    owner.repo.setFreeDays(CAMPAIGN, P1, ["2026-11-28"], "2026-11-20");
    const ownerBody = await (await availabilityCollection(owner.deps).GET(req("GET", ""))).json();
    expect(ownerBody.who["2026-11-28"]).toEqual(["Ann"]);
  });

  it("rejects malformed and out-of-window days", async () => {
    const { deps } = setup(P1);
    expect((await put(deps, ["2026-02-30"])).status).toBe(400);
    expect((await put(deps, ["2027-01-20"])).status).toBe(400);
    expect((await availabilityCollection(deps).PUT(req("PUT", "", { days: "x" }))).status).toBe(400);
  });

  it("keeps a past day as it was", async () => {
    const { deps, repo } = setup(P1);
    repo.setFreeDays(CAMPAIGN, P1, ["2026-11-10"], "2026-11-01");
    expect((await put(deps, ["2026-11-10", "2026-11-28"])).status).toBe(200);
    expect(Object.keys(repo.freeByDay(CAMPAIGN, "2026-11-01", "2026-12-31"))).toEqual(["2026-11-10", "2026-11-28"]);
    // the past day came from before today and stays; submitting it again did not add a second copy
    expect(repo.freeByDay(CAMPAIGN, "2026-11-10", "2026-11-10")["2026-11-10"]).toEqual([P1]);
  });

  it("announces a date once, when the last player ticks it", async () => {
    const a = setup(P1);
    a.repo.setPlayers(CAMPAIGN, [P1, P2]);
    await put(a.deps, ["2026-11-28"]);
    expect(a.sent).toHaveLength(0);
    a.repo.setFreeDays(CAMPAIGN, P2, ["2026-11-28"], "2026-11-20");
    await put(a.deps, ["2026-11-28"]);
    expect(a.sent).toHaveLength(1);
    expect(a.sent[0].text).toContain("Sat 28 Nov");
    await put(a.deps, ["2026-11-28"]);
    expect(a.sent).toHaveLength(1);
  });

  it("does not lose days beyond the message limit: they go out on a later save", async () => {
    const { deps, sent, repo } = setup(P1);
    const days = ["2026-11-28", "2026-11-29", "2026-12-05", "2026-12-06"];
    repo.setPlayers(CAMPAIGN, [P1, P2]);
    repo.setFreeDays(CAMPAIGN, P2, days, "2026-11-20");
    await put(deps, days);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).not.toContain("6 Dec");
    await put(deps, days);
    expect(sent).toHaveLength(2);
    expect(sent[1].text).toContain("Sun 6 Dec");
  });

  it("sends one message for two simultaneous saves", async () => {
    const { deps, sent, repo } = setup(P1);
    repo.setPlayers(CAMPAIGN, [P1, P2]);
    repo.setFreeDays(CAMPAIGN, P2, ["2026-11-28"], "2026-11-20");
    await Promise.all([put(deps, ["2026-11-28"]), put(deps, ["2026-11-28"])]);
    expect(sent).toHaveLength(1);
  });

  it("never blocks the save when Telegram fails, and retries on the next save", async () => {
    const failing = setup(P1, "fail");
    failing.repo.setPlayers(CAMPAIGN, [P1, P2]);
    failing.repo.setFreeDays(CAMPAIGN, P2, ["2026-11-28"], "2026-11-20");
    expect((await put(failing.deps, ["2026-11-28"])).status).toBe(200);
    expect(JSON.stringify(failing.logs)).toContain("telegram_failed");
    expect(new SettingsRepo(failing.db).get("availability_last_error")).not.toBeNull();

    const working = { ...failing.deps, notify: failing.deps.notify };
    const sent: Nudge[] = [];
    working.notify = () => async (nudge: Nudge) => void sent.push(nudge);
    await put(working, ["2026-11-28"]);
    expect(sent).toHaveLength(1);
    expect(new SettingsRepo(failing.db).get("availability_last_error")).toBeFalsy();
  });

  it("claims nothing while Telegram is not configured", async () => {
    const { deps, repo } = setup(P1, "off");
    repo.setPlayers(CAMPAIGN, [P1, P2]);
    repo.setFreeDays(CAMPAIGN, P2, ["2026-11-28"], "2026-11-20");
    expect((await put(deps, ["2026-11-28"])).status).toBe(200);
    expect(repo.claimUnanimous(CAMPAIGN, "2026-11-20")).toEqual(["2026-11-28"]);
  });

  it("lets a user off the player list save days that never count", async () => {
    const { deps, sent, repo } = setup(OUTSIDER);
    repo.setPlayers(CAMPAIGN, [P1, P2]);
    repo.setFreeDays(CAMPAIGN, P1, ["2026-11-28"], "2026-11-20");
    repo.setFreeDays(CAMPAIGN, P2, ["2026-11-28"], "2026-11-20");
    deps.getAccess = grantedAccess(OUTSIDER, [ROLE], [{ roleId: ROLE, permissions: ["play"], scope: "all" }]);
    expect((await put(deps, ["2026-11-29"])).status).toBe(200);
    expect(sent).toHaveLength(1); // 28th was already unanimous; the outsider changed nothing
  });
});

describe("availability player list and test message", () => {
  it("is owner-only", async () => {
    const { deps } = setup(P1);
    expect((await availabilityPlayers(deps).GET(req("GET", "/players"))).status).toBe(404);
    expect((await availabilityPlayers(deps).PUT(req("PUT", "/players", { userIds: [P1] }))).status).toBe(404);
    expect((await availabilityTest(deps).POST(req("POST", "/test"))).status).toBe(404);
  });

  it("lists candidates, saves the selection, and rejects unknown users", async () => {
    const { deps } = setup(OWNER);
    expect((await availabilityPlayers(deps).PUT(req("PUT", "/players", { userIds: [P1, "999999999999999999"] }))).status).toBe(400);
    expect((await availabilityPlayers(deps).PUT(req("PUT", "/players", { userIds: [P1, P2] }))).status).toBe(200);
    const body = await (await availabilityPlayers(deps).GET(req("GET", "/players"))).json();
    expect(body.selected.sort()).toEqual([P1, P2]);
    expect(body.candidates.map((c: { userId: string }) => c.userId)).toContain(OUTSIDER);
    expect(body.lastError).toBeNull();
  });

  it("announces days that were already unanimous once a player is removed", async () => {
    const { deps, sent, repo } = setup(OWNER);
    repo.setPlayers(CAMPAIGN, [P1, P2, OUTSIDER]);
    repo.setFreeDays(CAMPAIGN, P1, ["2026-11-28"], "2026-11-20");
    repo.setFreeDays(CAMPAIGN, P2, ["2026-11-28"], "2026-11-20");
    await availabilityPlayers(deps).PUT(req("PUT", "/players", { userIds: [P1, P2] }));
    expect(sent).toHaveLength(1);
  });

  it("reports not_configured and failed for the test message", async () => {
    expect(await (await availabilityTest(setup(OWNER, "off").deps).POST(req("POST", "/test"))).json()).toEqual({ sent: false, reason: "not_configured" });
    expect(await (await availabilityTest(setup(OWNER, "fail").deps).POST(req("POST", "/test"))).json()).toEqual({ sent: false, reason: "failed" });
    const ok = setup(OWNER);
    expect(await (await availabilityTest(ok.deps).POST(req("POST", "/test"))).json()).toEqual({ sent: true });
    expect(ok.sent).toHaveLength(1);
  });
});
