import type { Metadata } from "next";
import { KeptNotesView } from "@/components/views/play/BattleView";

export const metadata: Metadata = { title: "Kept notes" };

export default async function DemoKeptNotesViewPage(props: PageProps<"/demo/play/c/[campaign]/notes">) {
  const { campaign } = await props.params;
  return <KeptNotesView campaign={{ id: campaign, name: "Embers of Hollowmere" }} />;
}
