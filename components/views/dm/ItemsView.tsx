import { CampaignSwitcher } from "@/components/CampaignSelect";
import { DmHeader } from "@/components/dm/DmHeader";
import { ItemBrowser } from "@/components/dm/items/ItemBrowser";

// The DM Screen pages without their data source. The portal's pages read the
// database on the server and pass the result in; the demo's pages pass in what
// the browser-side demo store holds. Either way the same UI renders.

export function ItemsView() {
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
