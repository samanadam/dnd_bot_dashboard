import type { Metadata } from "next";
import { CampaignSwitcher } from "@/components/CampaignSelect";
import { AreaList } from "@/components/dm/areas/AreaList";
import { DmHeader } from "@/components/dm/DmHeader";
import { selectedCampaign } from "@/lib/campaign/selected";
import { requireDm } from "@/lib/dm/access";
import { AreaRepo } from "@/lib/dm/areas";
import { getDatabase } from "@/lib/dm/database";

export const metadata: Metadata = { title: "Areas" };
export const dynamic = "force-dynamic";

export default async function AreasPage() {
  await requireDm();
  return (
    <div className="space-y-6">
      <DmHeader
        eyebrow="DM Screen"
        title="Areas"
        description="The places of your campaign. Each one holds the battles that can happen there and the rewards the party can win: items, and pointers for what follows in the story."
        action={<CampaignSwitcher />}
      />
      <AreaList areas={new AreaRepo(getDatabase()).list(await selectedCampaign())} />
    </div>
  );
}
