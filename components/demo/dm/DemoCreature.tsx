"use client";

import { CreatureView } from "@/components/views/dm/CreatureView";
import { EditCreatureView } from "@/components/views/dm/EditCreatureView";
import { DemoMissing, WithDemo } from "../DemoFrame";

const back = { href: "/dm/bestiary", label: "Bestiary" };

export function DemoCreature({ id }: { id: string }) {
  return (
    <WithDemo>
      {(state) => {
        const creature = state.dm.creatures.find((c) => c.id === id);
        return creature ? <CreatureView creature={creature} /> : <DemoMissing what="creature" back={back} />;
      }}
    </WithDemo>
  );
}

export function DemoEditCreature({ id }: { id: string }) {
  return (
    <WithDemo>
      {(state) => {
        const creature = state.dm.creatures.find((c) => c.id === id);
        return creature ? <EditCreatureView creature={creature} /> : <DemoMissing what="creature" back={back} />;
      }}
    </WithDemo>
  );
}
