import type { Metadata } from "next";
import { CombatView } from "@/components/views/dm/CombatView";
import { dmSelection, requireDm } from "@/lib/dm/access";
import { getDatabase } from "@/lib/dm/database";
import { EncounterRepo } from "@/lib/dm/encounters";

export const metadata: Metadata = { title: "Combat" };
export const dynamic = "force-dynamic";

export default async function CombatPage() {
  const { scope } = await requireDm();
  return <CombatView encounters={new EncounterRepo(getDatabase()).list(await dmSelection(scope))} />;
}
