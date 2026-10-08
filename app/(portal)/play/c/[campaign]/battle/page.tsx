import type { Metadata } from "next";
import { BattleView } from "@/components/views/play/BattleView";
import { requirePlay } from "@/lib/play/pages";

export const metadata: Metadata = { title: "Battle" };
export const dynamic = "force-dynamic";

export default async function PlayBattleViewPage(props: PageProps<"/play/c/[campaign]/battle">) {
  const { campaign: id } = await props.params;
  const { campaign } = await requirePlay(id);
  return <BattleView campaign={campaign} />;
}
