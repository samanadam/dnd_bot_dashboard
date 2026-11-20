import { describe, expect, it } from "vitest";
import { AvailabilityRepo, CAMPAIGN } from "@/lib/availability/repo";
import { openDatabase } from "@/lib/dm/db";

const A = "111111111111111111";
const B = "222222222222222222";
const C = "333333333333333333";
const TODAY = "2026-11-20";

function setup() {
  const db = openDatabase(":memory:");
  return { db, repo: new AvailabilityRepo(db) };
}

describe("AvailabilityRepo", () => {
  it("replaces a user's future days and keeps past ones", () => {
    const { repo } = setup();
    repo.setFreeDays(CAMPAIGN, A, ["2026-11-10", "2026-11-25"], "2026-11-01");
    repo.setFreeDays(CAMPAIGN, A, ["2026-11-27"], TODAY);
    expect(repo.freeByDay(CAMPAIGN, "2026-11-01", "2026-12-31")).toEqual({
      "2026-11-10": [A],
      "2026-11-27": [A],
    });
  });

  it("replaces the player list", () => {
    const { repo } = setup();
    repo.setPlayers(CAMPAIGN, [A, B]);
    repo.setPlayers(CAMPAIGN, [B, C]);
    expect(repo.players(CAMPAIGN).sort()).toEqual([B, C]);
  });

  it("claims nothing with fewer than two players", () => {
    const { repo } = setup();
    repo.setPlayers(CAMPAIGN, [A]);
    repo.setFreeDays(CAMPAIGN, A, ["2026-11-28"], TODAY);
    expect(repo.claimUnanimous(CAMPAIGN, TODAY)).toEqual([]);
  });

  it("claims a day every player is free on, once", () => {
    const { repo } = setup();
    repo.setPlayers(CAMPAIGN, [A, B]);
    repo.setFreeDays(CAMPAIGN, A, ["2026-11-28", "2026-11-29"], TODAY);
    repo.setFreeDays(CAMPAIGN, B, ["2026-11-28"], TODAY);
    expect(repo.claimUnanimous(CAMPAIGN, TODAY)).toEqual(["2026-11-28"]);
    expect(repo.claimUnanimous(CAMPAIGN, TODAY)).toEqual([]);
  });

  it("never claims today or past days", () => {
    const { repo } = setup();
    repo.setPlayers(CAMPAIGN, [A, B]);
    for (const user of [A, B]) repo.setFreeDays(CAMPAIGN, user, [TODAY], "2026-11-01");
    expect(repo.claimUnanimous(CAMPAIGN, TODAY)).toEqual([]);
  });

  it("ignores users who are not on the player list", () => {
    const { repo } = setup();
    repo.setPlayers(CAMPAIGN, [A, B]);
    repo.setFreeDays(CAMPAIGN, A, ["2026-11-28"], TODAY);
    repo.setFreeDays(CAMPAIGN, C, ["2026-11-28"], TODAY);
    expect(repo.claimUnanimous(CAMPAIGN, TODAY)).toEqual([]);
    repo.setFreeDays(CAMPAIGN, B, ["2026-11-28"], TODAY);
    expect(repo.claimUnanimous(CAMPAIGN, TODAY)).toEqual(["2026-11-28"]);
  });
});
