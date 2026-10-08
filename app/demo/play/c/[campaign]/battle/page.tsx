import type { Metadata } from "next";
import { BattleView } from "@/components/views/play/BattleView";

export const metadata: Metadata = { title: "Battle" };

export default async function DemoBattleViewPage(props: PageProps<"/demo/play/c/[campaign]/battle">) {
  const { campaign } = await props.params;
  return <BattleView campaign={{ id: campaign, name: "Embers of Hollowmere" }} />;
}
