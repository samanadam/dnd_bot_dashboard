import type { Metadata } from "next";
import { CombatView } from "@/components/views/dm/CombatView";
import { selectedCampaign } from "@/lib/campaign/selected";
import { requireDm } from "@/lib/dm/access";
import { getDatabase } from "@/lib/dm/database";
import { EncounterRepo } from "@/lib/dm/encounters";

export const metadata: Metadata = { title: "Combat" };
export const dynamic = "force-dynamic";

export default async function CombatPage() {
  await requireDm();
  return <CombatView encounters={new EncounterRepo(getDatabase()).list(await selectedCampaign())} />;
}
