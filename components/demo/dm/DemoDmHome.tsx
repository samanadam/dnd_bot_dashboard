"use client";

import { DmHomeView } from "@/components/views/dm/DmHomeView";
import { encounterSummaries } from "@/lib/demo/dmTransport";
import { DEMO_SRD_MONSTERS } from "@/lib/demo/srdSample";
import { WithDemo } from "../DemoFrame";

export function DemoDmHome() {
  return (
    <WithDemo>
      {(state) => {
        const npcs = state.dm.creatures.filter((c) => c.kind === "npc").length;
        return (
          <DmHomeView
            encounters={encounterSummaries(state, null)}
            monsterCount={DEMO_SRD_MONSTERS.length + state.dm.creatures.length - npcs}
            npcCount={npcs}
            areaCount={state.dm.areas.length}
          />
        );
      }}
    </WithDemo>
  );
}
