import type { Metadata } from "next";
import { KeptNotesView } from "@/components/views/play/BattleView";
import { requirePlay } from "@/lib/play/pages";

export const metadata: Metadata = { title: "Kept notes" };
export const dynamic = "force-dynamic";

export default async function PlayKeptNotesViewPage(props: PageProps<"/play/c/[campaign]/notes">) {
  const { campaign: id } = await props.params;
  const { campaign } = await requirePlay(id);
  return <KeptNotesView campaign={campaign} />;
}
