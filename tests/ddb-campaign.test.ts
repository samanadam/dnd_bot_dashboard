import { describe, expect, it } from "vitest";
import { campaignOf, NO_DDB_CAMPAIGN, resolveCampaign } from "@/lib/ddb/campaign";

const forge = { id: "c1", name: "Magic Forge Of Phandelver" };
const tyranny = { id: "c2", name: "Tyranny of Dragons" };
const ddb = { id: "8266155", name: "Tyranny of Dragons" };

describe("campaignOf", () => {
  it("reads the D&D Beyond campaign off a character, and nothing when there is none", () => {
    expect(campaignOf({ data: { campaign: { id: 8266155, name: " Tyranny of Dragons " } } })).toEqual({ id: "8266155", name: "Tyranny of Dragons" });
    expect(campaignOf({ data: { campaign: null } })).toBeNull();
    // Ids are digits; anything else, or a huge value, is not a campaign we will store.
    expect(campaignOf({ data: { campaign: { id: "x".repeat(5000), name: "Evil" } } })).toBeNull();
    expect(campaignOf({ data: { campaign: { id: 1.5, name: "Evil" } } })).toBeNull();
    expect(campaignOf({ data: { campaign: { id: 7, name: "N".repeat(5000) } } })?.name).toHaveLength(120);
    expect(campaignOf({ data: {} })).toBeNull();
    expect(campaignOf({ data: { campaign: { id: "x", name: 5 } } })).toBeNull();
    expect(campaignOf(null)).toBeNull();
  });
});

describe("resolveCampaign", () => {
  it("uses a choice that was made before, as long as the player still plays there", () => {
    expect(resolveCampaign({ ddb, mapped: "c1", candidates: [forge, tyranny] })).toEqual({ kind: "ok", campaignId: "c1", remember: false });
    // A choice for a campaign the player left is ignored: the name match decides, or they are asked.
    expect(resolveCampaign({ ddb, mapped: "gone", candidates: [forge, tyranny] })).toEqual({ kind: "ok", campaignId: "c2", remember: true });
    expect(resolveCampaign({ ddb: { id: "9", name: "Other table" }, mapped: "gone", candidates: [forge, tyranny] }).kind).toBe("needs");
  });

  it("matches the D&D Beyond campaign name to a portal campaign, ignoring case and spacing", () => {
    expect(resolveCampaign({ ddb: { id: "1", name: "  tyranny OF dragons" }, mapped: null, candidates: [forge, tyranny] })).toEqual({ kind: "ok", campaignId: "c2", remember: true });
  });

  it("does not guess when two campaigns carry the same name", () => {
    const twin = { id: "c3", name: "Tyranny of Dragons" };
    expect(resolveCampaign({ ddb, mapped: null, candidates: [tyranny, twin, forge] })).toEqual({ kind: "needs", candidates: [tyranny, twin, forge] });
  });

  it("falls back to the only campaign the player plays in", () => {
    expect(resolveCampaign({ ddb: { id: "9", name: "Some other table" }, mapped: null, candidates: [forge] })).toEqual({ kind: "ok", campaignId: "c1", remember: true });
    expect(resolveCampaign({ ddb: null, mapped: null, candidates: [forge] })).toEqual({ kind: "ok", campaignId: "c1", remember: true });
  });

  it("asks when it cannot tell, and says there is nothing to pick when the player plays nowhere", () => {
    expect(resolveCampaign({ ddb: { id: "9", name: "Some other table" }, mapped: null, candidates: [forge, tyranny] })).toEqual({ kind: "needs", candidates: [forge, tyranny] });
    expect(resolveCampaign({ ddb: null, mapped: null, candidates: [] })).toEqual({ kind: "none" });
  });

  it("keys a character that is in no D&D Beyond campaign by a reserved id", () => {
    expect(NO_DDB_CAMPAIGN).toBe("none");
  });
});
