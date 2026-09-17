import type { Metadata } from "next";
import { EncounterList } from "@/components/dm/combat/EncounterList";
import { DmHeader } from "@/components/dm/DmHeader";
import { requireDm } from "@/lib/dm/access";
import { getDatabase } from "@/lib/dm/database";
import { EncounterRepo } from "@/lib/dm/encounters";

export const metadata: Metadata = { title: "Combat" };
export const dynamic = "force-dynamic";

export default async function CombatPage() {
  await requireDm();
  return (
    <div className="space-y-6">
      <DmHeader
        eyebrow="DM Screen"
        title="Combat"
        description="Initiative, turns, hit points and conditions, with every stat block one click away. Changes save automatically."
      />
      <EncounterList encounters={new EncounterRepo(getDatabase()).list()} />
    </div>
  );
}
