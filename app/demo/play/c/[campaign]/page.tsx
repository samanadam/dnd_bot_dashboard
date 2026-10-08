import type { Metadata } from "next";
import { SheetListView } from "@/components/views/play/PlayCampaignView";

export const metadata: Metadata = { title: "Characters" };

export default async function DemoPlayCampaign(props: PageProps<"/demo/play/c/[campaign]">) {
  const { campaign } = await props.params;
  return <SheetListView campaign={{ id: campaign, name: "Embers of Hollowmere" }} manager={false} base={`/play/c/${campaign}/sheets`} battleHref={`/play/c/${campaign}/battle`} />;
}
