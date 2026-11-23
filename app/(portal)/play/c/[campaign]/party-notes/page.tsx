import type { Metadata } from "next";
import { PartyNotesView } from "@/components/views/play/PartyNotesView";
import { requirePlay } from "@/lib/play/pages";

export const metadata: Metadata = { title: "Party notes" };
export const dynamic = "force-dynamic";

export default async function PartyNotesPage(props: PageProps<"/play/c/[campaign]/party-notes">) {
  const { campaign: id } = await props.params;
  const { campaign } = await requirePlay(id);
  return <PartyNotesView campaign={campaign} />;
}
