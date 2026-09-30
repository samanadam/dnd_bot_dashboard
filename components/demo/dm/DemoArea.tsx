"use client";

import { AreaView } from "@/components/views/dm/AreaView";
import { areaDetailOf } from "@/lib/demo/dmTransport";
import { DemoMissing, WithDemo } from "../DemoFrame";

export function DemoArea({ id }: { id: string }) {
  return (
    <WithDemo>
      {(state) => {
        const area = state.dm.areas.find((a) => a.id === id);
        return area ? <AreaView detail={areaDetailOf(state, area)} /> : <DemoMissing what="area" back={{ href: "/dm/areas", label: "All areas" }} />;
      }}
    </WithDemo>
  );
}
