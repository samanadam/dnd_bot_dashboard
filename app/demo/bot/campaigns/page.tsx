import type { Metadata } from "next";
import { CampaignsPanel } from "@/components/bot/CampaignsPanel";

export const metadata: Metadata = { title: "Campaigns" };

export default function DemoCampaignsPage() {
  return <CampaignsPanel canManage />;
}
