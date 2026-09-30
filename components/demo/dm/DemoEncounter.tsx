"use client";

import { EncounterView } from "@/components/views/dm/EncounterView";
import { demoCustomSummaries, demoSrdSummaries } from "@/lib/demo/srd";
import { useDemoState } from "@/lib/demo/store";
import { DemoLoading, DemoMissing } from "../DemoFrame";

export function DemoEncounter({ id }: { id: string }) {
  const state = useDemoState();
  if (!state) return <DemoLoading />;
  const stored = state.dm.encounters.find((e) => e.id === id);
  if (!stored) return <DemoMissing what="encounter" back={{ href: "/dm/combat", label: "All encounters" }} />;
  // The tracker keeps its own copy and autosaves it; it is keyed by id, so the
  // store changing under it after each save does not reset the fight.
  return <EncounterView stored={stored} creatures={[...demoCustomSummaries(state, "all"), ...demoSrdSummaries()]} />;
}
