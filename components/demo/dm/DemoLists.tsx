"use client";

import { AreasView } from "@/components/views/dm/AreasView";
import { CombatView } from "@/components/views/dm/CombatView";
import { npcCards, NpcsView } from "@/components/views/dm/NpcsView";
import { useCampaignSelection } from "@/lib/campaign/useSelection";
import { areaSummaries, encounterSummaries } from "@/lib/demo/dmTransport";
import { WithDemo } from "../DemoFrame";

// The demo's campaign-filtered lists. The portal filters on the server by the
// campaign cookie; here the same choice comes from the demo's own local value.

const inScope = (campaignId: string | null, scope: string | null) => scope === null || (scope === "unassigned" ? campaignId === null : campaignId === scope);

export function DemoNpcs() {
  const [campaign] = useCampaignSelection();
  return <WithDemo>{(state) => <NpcsView npcs={npcCards(state.dm.creatures.filter((c) => c.kind === "npc" && inScope(c.campaignId, campaign)))} />}</WithDemo>;
}

export function DemoAreas() {
  const [campaign] = useCampaignSelection();
  return <WithDemo>{(state) => <AreasView areas={areaSummaries(state, campaign)} />}</WithDemo>;
}

export function DemoCombat() {
  const [campaign] = useCampaignSelection();
  return <WithDemo>{(state) => <CombatView encounters={encounterSummaries(state, campaign)} />}</WithDemo>;
}
