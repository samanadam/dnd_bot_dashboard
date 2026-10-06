import type { Metadata } from "next";
import { CampaignsPanel } from "@/components/bot/CampaignsPanel";
import { can } from "@/lib/access/permissions";
import { requireAccess } from "@/lib/access/server";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const access = await requireAccess("bot.view");
  // Only decides whether the editing controls render; the proxy enforces it.
  return <CampaignsPanel canManage={can(access, "bot.manage")} />;
}
