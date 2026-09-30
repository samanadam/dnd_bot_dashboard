import { CampaignSwitcher } from "@/components/CampaignSelect";
import { AreaList } from "@/components/dm/areas/AreaList";
import { DmHeader } from "@/components/dm/DmHeader";
import type { AreaSummary } from "@/lib/dm/areas";

// The DM Screen pages without their data source. The portal's pages read the
// database on the server and pass the result in; the demo's pages pass in what
// the browser-side demo store holds. Either way the same UI renders.

export function AreasView({ areas }: { areas: AreaSummary[] }) {
  return (
    <div className="space-y-6">
      <DmHeader
        eyebrow="DM Screen"
        title="Areas"
        description="The places of your campaign. Each one holds the battles that can happen there and the rewards the party can win: items, and pointers for what follows in the story."
        action={<CampaignSwitcher />}
      />
      <AreaList areas={areas} />
    </div>
  );
}
