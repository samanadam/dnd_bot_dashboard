import type { Metadata } from "next";
import { CampaignsPanel } from "@/components/bot/CampaignsPanel";
import { isDm } from "@/lib/dm/isDm";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const user = await requireUser();
  // Only decides whether the editing controls render; the proxy enforces it.
  return <CampaignsPanel canManage={isDm(user.id, env().DM_USER_IDS)} />;
}
