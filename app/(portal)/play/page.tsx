import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PlayHomeView } from "@/components/views/play/PlayHomeView";
import { requireAccess } from "@/lib/access/server";
import { playCampaigns } from "@/lib/play/campaigns";

export const metadata: Metadata = { title: "Your campaigns" };
export const dynamic = "force-dynamic";

export default async function PlayHome() {
  const access = await requireAccess("play");
  const campaigns = await playCampaigns(access);
  // One campaign: straight to it.
  if (campaigns?.length === 1) redirect(`/play/c/${campaigns[0].id}`);
  return <PlayHomeView campaigns={campaigns} />;
}
