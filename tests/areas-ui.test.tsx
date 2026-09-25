import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RewardsPanel, toInputs } from "@/components/dm/areas/RewardsPanel";
import type { AreaDetail, RewardView } from "@/lib/dm/areaView";
import { rewardInputSchema } from "@/lib/dm/rewards";

const ID = "11111111-1111-4111-8111-111111111111";
const BATTLE = "22222222-2222-4222-8222-222222222222";

const sword: RewardView = {
  kind: "item",
  id: ID,
  encounterId: BATTLE,
  status: "given",
  itemRef: { source: "srd", edition: "2014", slug: "longsword" },
  quantity: 2,
  note: "in the chest",
  resolved: { name: "Longsword", category: "Weapon", rarity: "Rare" },
};
const gone: RewardView = { ...sword, id: "33333333-3333-4333-8333-333333333333", encounterId: null, status: "planned", quantity: 1, note: "", resolved: null };
const favour: RewardView = {
  kind: "pointer",
  id: "44444444-4444-4444-8444-444444444444",
  encounterId: null,
  status: "pending",
  title: "Friends of the village",
  condition: "Save the mayor",
  outcome: "They shelter the party in act 3",
  npcRef: { source: "custom", id: "55555555-5555-4555-8555-555555555555" },
  resolved: { name: "Mayor Osric" },
};

const detail = (rewards: RewardView[]): AreaDetail => ({
  area: { id: ID, name: "Cave", summary: "", notes: "", campaignId: null, position: 0, version: 1, createdAt: "", updatedAt: "" },
  battles: [{ id: BATTLE, name: "Ambush", combatants: 3, prepared: true }],
  rewards,
});

const render = (rewards: RewardView[]) =>
  renderToStaticMarkup(<RewardsPanel detail={detail(rewards)} campaign={null} busy={false} onReplace={async () => true} onStatus={() => undefined} />);

describe("rewards panel", () => {
  it("shows items with quantity, rarity, note and where they come from", () => {
    const html = render([sword]);
    expect(html).toContain("Longsword");
    expect(html).toContain("2 ×");
    expect(html).toContain("Rare");
    expect(html).toContain("in the chest");
    expect(html).toContain("Ambush");
  });

  it("shows a pointer's condition, outcome and linked NPC", () => {
    const html = render([favour]);
    expect(html).toContain("Friends of the village");
    expect(html).toContain("Save the mayor");
    expect(html).toContain("They shelter the party in act 3");
    expect(html).toContain("Mayor Osric");
    expect(html).toContain("Whole area");
  });

  it("marks an item or NPC that no longer exists instead of failing", () => {
    expect(render([gone])).toContain("Missing item");
    expect(render([{ ...favour, resolved: null }])).toContain("missing creature");
  });

  it("offers the statuses of each kind and marks the current one", () => {
    const html = render([sword, favour]);
    expect(html).toMatch(/aria-checked="true"[^>]*>Given</);
    expect(html).toMatch(/aria-checked="false"[^>]*>Planned</);
    expect(html).toMatch(/aria-checked="false"[^>]*>Skipped</);
    expect(html).toMatch(/aria-checked="true"[^>]*>Pending</);
    expect(html).toContain(">Earned<");
    expect(html).toContain(">Lost<");
    // A pointer is never offered "Given", and an item never "Earned".
    const itemOnly = render([sword]);
    expect(itemOnly).not.toContain(">Earned<");
    expect(render([favour])).not.toContain(">Given<");
  });

  it("shows an empty state, and never turns reward text into markup", () => {
    expect(render([])).toContain("No rewards yet");
    const html = render([{ ...favour, title: '<img src=x onerror="alert(1)">', outcome: "<script>alert(1)</script>" }]);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img");
  });

  it("disables editing controls while a save is in flight", () => {
    const html = renderToStaticMarkup(<RewardsPanel detail={detail([sword])} campaign={null} busy onReplace={async () => true} onStatus={() => undefined} />);
    expect(html).toMatch(/<button[^>]*disabled[^>]*aria-label="Delete reward"/);
  });
});

describe("what a save sends", () => {
  it("keeps ids and drops the names looked up for display", () => {
    const inputs = toInputs([sword, favour]);
    expect(inputs[0]).toEqual({
      kind: "item",
      id: ID,
      encounterId: BATTLE,
      status: "given",
      itemRef: { source: "srd", edition: "2014", slug: "longsword" },
      quantity: 2,
      note: "in the chest",
    });
    expect(JSON.stringify(inputs)).not.toContain("resolved");
    expect(JSON.stringify(inputs)).not.toContain("Mayor Osric");
    for (const input of inputs) expect(rewardInputSchema.safeParse(input).success).toBe(true);
  });
});
