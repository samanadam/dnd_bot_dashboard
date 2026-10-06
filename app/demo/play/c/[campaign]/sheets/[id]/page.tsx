import type { Metadata } from "next";
import { SheetLoader } from "@/components/views/play/PlayCampaignView";

export const metadata: Metadata = { title: "Character" };

export default async function DemoPlaySheet(props: PageProps<"/demo/play/c/[campaign]/sheets/[id]">) {
  const { campaign, id } = await props.params;
  return <SheetLoader id={id} backHref={`/play/c/${campaign}`} />;
}
