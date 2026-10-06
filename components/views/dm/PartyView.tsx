"use client";

import { CampaignSwitcher } from "@/components/CampaignSelect";
import { DmHeader } from "@/components/dm/DmHeader";
import { SheetListView } from "@/components/views/play/PlayCampaignView";
import { EmptyState } from "@/components/ui";
import { useCampaigns } from "@/lib/bot/useBotState";
import { useCampaignSelection } from "@/lib/campaign/useSelection";
import { Users } from "lucide-react";

/** The DM's view of the party: every sheet in the campaign picked in the switcher. */
export function PartyView() {
  const [selection] = useCampaignSelection();
  const campaigns = useCampaigns();
  const campaign = selection && selection !== "unassigned" ? (campaigns.data ?? []).find((c) => c.id === selection) : null;
  return (
    <div className="space-y-6">
      <DmHeader eyebrow="DM Screen" title="Party" description="Every character sheet in a campaign: players' own, and the ones you hold for them." action={<CampaignSwitcher />} />
      {campaign ? (
        <SheetListView key={campaign.id} campaign={{ id: campaign.id, name: campaign.name }} manager base="/dm/party" />
      ) : (
        <div className="rounded-3xl border border-dashed border-border py-6">
          <EmptyState icon={Users} title="Pick a campaign">
            Sheets belong to one campaign each. Choose it in the switcher above.
          </EmptyState>
        </div>
      )}
    </div>
  );
}
