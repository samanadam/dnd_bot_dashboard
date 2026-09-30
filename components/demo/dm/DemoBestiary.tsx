"use client";

import { BestiaryView } from "@/components/views/dm/BestiaryView";
import { demoCustomSummaries, demoSrdSummaries } from "@/lib/demo/srd";
import { WithDemo } from "../DemoFrame";

export function DemoBestiary({ initialSource }: { initialSource: "all" | "custom" }) {
  return (
    <WithDemo>{(state) => <BestiaryView monsters={[...demoCustomSummaries(state, "monster"), ...demoSrdSummaries()]} initialSource={initialSource} />}</WithDemo>
  );
}
