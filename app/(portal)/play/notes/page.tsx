import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PlayHomeView } from "@/components/views/play/PlayHomeView";
import { requireAnyAccess } from "@/lib/access/server";
import { playCampaigns } from "@/lib/play/campaigns";

export const metadata: Metadata = { title: "Party notes" };
export const dynamic = "force-dynamic";

export default async function PartyNotesHome() {
  const access = await requireAnyAccess(["play", "sheets.manage"]);
  const campaigns = await playCampaigns(access);
  if (campaigns?.length === 1) redirect(`/play/c/${campaigns[0].id}/party-notes`);
  return <PlayHomeView campaigns={campaigns} to="/party-notes" title="Party notes" description="Pick a campaign to read and write its shared notes." />;
}
