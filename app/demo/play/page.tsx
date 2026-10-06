import type { Metadata } from "next";
import { PlayHomeView } from "@/components/views/play/PlayHomeView";
import { CAMPAIGN_EMBER } from "@/lib/demo/fixtures";

export const metadata: Metadata = { title: "Your campaigns" };

export default function DemoPlayHome() {
  return <PlayHomeView campaigns={[{ id: CAMPAIGN_EMBER, name: "Embers of Hollowmere" }]} />;
}
