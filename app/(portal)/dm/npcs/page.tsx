import type { Metadata } from "next";
import { npcCards, NpcsView } from "@/components/views/dm/NpcsView";
import { dmSelection, requireDm } from "@/lib/dm/access";
import { CreatureRepo } from "@/lib/dm/creatures";
import { getDatabase } from "@/lib/dm/database";

export const metadata: Metadata = { title: "NPCs" };
export const dynamic = "force-dynamic";

export default async function NpcsPage() {
  const { scope } = await requireDm();
  return <NpcsView npcs={npcCards(new CreatureRepo(getDatabase()).list("npc", await dmSelection(scope)))} />;
}
