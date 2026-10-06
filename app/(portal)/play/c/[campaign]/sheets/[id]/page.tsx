import type { Metadata } from "next";
import { SheetLoader } from "@/components/views/play/PlayCampaignView";
import { openSheet, requirePlay } from "@/lib/play/pages";

export const metadata: Metadata = { title: "Character" };
export const dynamic = "force-dynamic";

export default async function PlaySheetPage(props: PageProps<"/play/c/[campaign]/sheets/[id]">) {
  const { campaign: campaignId, id } = await props.params;
  const { access, others } = await requirePlay(campaignId);
  const view = openSheet(access, campaignId, id);
  return <SheetLoader id={id} initial={view} backHref={`/play/c/${campaignId}`} otherCampaigns={others} />;
}
