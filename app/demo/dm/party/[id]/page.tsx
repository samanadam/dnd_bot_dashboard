import type { Metadata } from "next";
import { SheetLoader } from "@/components/views/play/PlayCampaignView";

export const metadata: Metadata = { title: "Character" };

export default async function DemoPartySheet(props: PageProps<"/demo/dm/party/[id]">) {
  const { id } = await props.params;
  return <SheetLoader id={id} backHref="/dm/party" />;
}
