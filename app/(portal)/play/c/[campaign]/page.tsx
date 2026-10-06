import type { Metadata } from "next";
import { SheetListView } from "@/components/views/play/PlayCampaignView";
import { canManage } from "@/lib/sheets/access";
import { requirePlay, sheetSummaries } from "@/lib/play/pages";

export const metadata: Metadata = { title: "Characters" };
export const dynamic = "force-dynamic";

export default async function PlayCampaignPage(props: PageProps<"/play/c/[campaign]">) {
  const { campaign: id } = await props.params;
  const { access, campaign } = await requirePlay(id);
  return (
    <SheetListView
      campaign={campaign}
      initial={sheetSummaries(access, id)}
      manager={canManage(access, id)}
      base={`/play/c/${id}/sheets`}
      battleHref={`/play/c/${id}/battle`}
    />
  );
}
