import type { Metadata } from "next";
import { CampaignSwitcher } from "@/components/CampaignSelect";
import { DmHeader } from "@/components/dm/DmHeader";
import { ItemBrowser } from "@/components/dm/items/ItemBrowser";
import { requireDm } from "@/lib/dm/access";

export const metadata: Metadata = { title: "Items" };
export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  await requireDm();
  return (
    <div className="space-y-6">
      <DmHeader
        eyebrow="DM Screen"
        title="Items"
        description="Equipment and magic items from the free SRD, and the ones you invent. Rewards in your areas point at these."
        action={<CampaignSwitcher />}
      />
      <ItemBrowser />
    </div>
  );
}
