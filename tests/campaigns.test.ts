import { describe, expect, it, vi } from "vitest";
import { matchRule } from "@/lib/bot/allowlist";
import { handleBotRequest, ReadCache, type ProxyDeps } from "@/lib/bot/proxy";
import { parseSelection, parseSelectionStrict } from "@/lib/campaign/selection";
import { CreatureRepo } from "@/lib/dm/creatures";
import { openDatabase } from "@/lib/dm/db";
import { EncounterRepo } from "@/lib/dm/encounters";
import { RateLimiter } from "@/lib/rateLimit";
import { goblin } from "./fixtures/goblin";

const CAMPAIGN = "0123456789ab";
const OTHER = "ba9876543210";

describe("campaign selection", () => {
  it("accepts an id or unassigned and treats anything else as all", () => {
    expect(parseSelection(CAMPAIGN)).toBe(CAMPAIGN);
    expect(parseSelection("unassigned")).toBe("unassigned");
    for (const bad of ["", "ABCDEF012345", "0123456789a", "0123456789abc", "1; DROP TABLE", "all", undefined, null]) {
      expect(parseSelection(bad)).toBeNull();
    }
  });

  it("is strict about query strings", () => {
    expect(parseSelectionStrict(null)).toEqual({ ok: true, selection: null });
    expect(parseSelectionStrict(CAMPAIGN)).toEqual({ ok: true, selection: CAMPAIGN });
    expect(parseSelectionStrict("nope")).toEqual({ ok: false });
  });
});

describe("campaign scoping in the DM database", () => {
  const npc = (name: string, campaignId?: string | null) => ({
    kind: "npc" as const,
    statBlock: { ...goblin, name },
    notes: "",
    tags: [],
    ...(campaignId !== undefined ? { campaignId } : {}),
  });

  it("filters NPCs by campaign, unassigned and all", () => {
    const repo = new CreatureRepo(openDatabase(":memory:"));
    repo.create(npc("A", CAMPAIGN));
    repo.create(npc("B", OTHER));
    repo.create(npc("C"));
    const names = (selection: string | null) => repo.list("npc", selection).map((c) => c.statBlock.name).sort();
    expect(names(null)).toEqual(["A", "B", "C"]);
    expect(names(CAMPAIGN)).toEqual(["A"]);
    expect(names("unassigned")).toEqual(["C"]);
  });

  it("leaves the campaign alone on an update that does not mention it, and moves it when asked", () => {
    const repo = new CreatureRepo(openDatabase(":memory:"));
    const created = repo.create(npc("A", CAMPAIGN));
    expect(repo.update(created.id, npc("A renamed"))?.campaignId).toBe(CAMPAIGN);
    expect(repo.update(created.id, npc("A renamed", OTHER))?.campaignId).toBe(OTHER);
    expect(repo.update(created.id, npc("A renamed", null))?.campaignId).toBeNull();
  });

  it("files encounters under a campaign and moves them without touching the version", () => {
    const repo = new EncounterRepo(openDatabase(":memory:"));
    const inCampaign = repo.create("Ambush", CAMPAIGN);
    const loose = repo.create("Tavern brawl");
    expect(repo.list(CAMPAIGN).map((e) => e.id)).toEqual([inCampaign.id]);
    expect(repo.list("unassigned").map((e) => e.id)).toEqual([loose.id]);

    expect(repo.setCampaign(loose.id, OTHER)).toBe(true);
    expect(repo.get(loose.id)).toMatchObject({ version: 1, campaignId: OTHER });
    expect(repo.setCampaign(loose.id, null)).toBe(true);
    expect(repo.setCampaign(loose.id, "not-an-id")).toBe(false);
    expect(repo.setCampaign("00000000-0000-4000-8000-000000000000", CAMPAIGN)).toBe(false);
    // Saving from the tracker keeps the campaign.
    const saved = repo.save(inCampaign.id, 1, { ...inCampaign.encounter, round: 1 });
    expect(saved).toMatchObject({ campaignId: CAMPAIGN });
  });
});

describe("campaign allowlist", () => {
  it("matches only well-formed campaign ids", () => {
    expect(matchRule("GET", ["campaigns"])).not.toBeNull();
    expect(matchRule("GET", ["campaigns", CAMPAIGN])).not.toBeNull();
    expect(matchRule("GET", ["campaigns", "ABCDEF012345"])).toBeNull();
    expect(matchRule("GET", ["campaigns", "short"])).toBeNull();
    expect(matchRule("POST", ["campaigns", CAMPAIGN, "update"])?.rule.dmOnly).toBe(true);
    expect(matchRule("POST", ["campaigns", "..", "update"])).toBeNull();
    expect(matchRule("DELETE", ["campaigns", CAMPAIGN])).toBeNull();
  });

  it("makes every write a DM-only, audited call", () => {
    const writes: [string, string[]][] = [
      ["POST", ["campaigns"]],
      ["POST", ["campaigns", CAMPAIGN, "update"]],
      ["POST", ["campaigns", CAMPAIGN, "terms"]],
      ["POST", ["campaigns", CAMPAIGN, "corrections"]],
      ["POST", ["sessions", "2026-09-09-2130-a1b2c3d4", "campaign"]],
    ];
    for (const [method, segments] of writes) {
      const rule = matchRule(method, segments)?.rule;
      expect(rule?.dmOnly, segments.join("/")).toBe(true);
      expect(rule?.audit, segments.join("/")).toBe(true);
    }
  });

  it("validates bodies strictly", () => {
    const assign = matchRule("POST", ["sessions", "2026-09-09-2130-a1b2c3d4", "campaign"])!.rule.body!;
    expect(assign.safeParse({ campaign_id: CAMPAIGN }).success).toBe(true);
    expect(assign.safeParse({ campaign_id: null }).success).toBe(true);
    expect(assign.safeParse({ campaign_id: "x" }).success).toBe(false);
    expect(assign.safeParse({ campaign_id: CAMPAIGN, guild_id: "1" }).success).toBe(false);

    const corrections = matchRule("POST", ["campaigns", CAMPAIGN, "corrections"])!.rule.body!;
    expect(corrections.safeParse({ corrections: [{ heard: "a", correct: "b" }] }).success).toBe(true);
    expect(corrections.safeParse({ corrections: [{ heard: "a", correct: "b", extra: 1 }] }).success).toBe(false);
    const tooMany = Array.from({ length: 201 }, () => ({ heard: "a", correct: "b" }));
    expect(corrections.safeParse({ corrections: tooMany }).success).toBe(false);

    const start = matchRule("POST", ["recording", "start"])!.rule.body!;
    expect(start.safeParse({ channel_id: "123456789012345678", campaign_id: CAMPAIGN }).success).toBe(true);
    expect(start.safeParse({ channel_id: "123456789012345678", campaign_id: "nope" }).success).toBe(false);
  });

  it("filters the session list only by a campaign id or unassigned", () => {
    const query = matchRule("GET", ["sessions"])!.rule.query!;
    expect(query.safeParse({ campaign: CAMPAIGN }).success).toBe(true);
    expect(query.safeParse({ campaign: "unassigned" }).success).toBe(true);
    expect(query.safeParse({ campaign: "1 OR 1=1" }).success).toBe(false);
  });
});

describe("campaign writes through the proxy", () => {
  function deps(isDm: boolean): ProxyDeps & { fetchImpl: ReturnType<typeof vi.fn> } {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true }));
    return {
      getUserId: async () => "42",
      isDm: () => isDm,
      botUrl: "https://bot.example/api/v1",
      botToken: "test-token-abcdefghijklmnop",
      fetchImpl,
      limiter: new RateLimiter(),
      cache: new ReadCache(),
    } as ProxyDeps & { fetchImpl: ReturnType<typeof vi.fn> };
  }
  const post = (path: string, body: unknown) =>
    new Request(`https://portal.example/api/bot/${path}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "x-portal-request": "1", "content-type": "application/json", "sec-fetch-site": "same-origin" },
    });

  it("hides campaign writes from anyone who is not the DM", async () => {
    const d = deps(false);
    const res = await handleBotRequest(post(`campaigns/${CAMPAIGN}/terms`, { terms: ["Eldrin"] }), ["campaigns", CAMPAIGN, "terms"], d);
    expect(res.status).toBe(404);
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });

  it("lets the DM through, and allows a glossary larger than the default body cap", async () => {
    const d = deps(true);
    const terms = Array.from({ length: 100 }, (_, i) => `Name-${i}-${"x".repeat(40)}`);
    const res = await handleBotRequest(post(`campaigns/${CAMPAIGN}/terms`, { terms }), ["campaigns", CAMPAIGN, "terms"], d);
    expect(res.status).toBe(200);
    expect(d.fetchImpl).toHaveBeenCalledTimes(1);
  });
});
