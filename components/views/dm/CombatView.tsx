import { CampaignSwitcher } from "@/components/CampaignSelect";
import { EncounterList } from "@/components/dm/combat/EncounterList";
import { DmHeader } from "@/components/dm/DmHeader";
import type { EncounterSummary } from "@/lib/dm/encounters";

// The DM Screen pages without their data source. The portal's pages read the
// database on the server and pass the result in; the demo's pages pass in what
// the browser-side demo store holds. Either way the same UI renders.

export function CombatView({ encounters }: { encounters: EncounterSummary[] }) {
  return (
    <div className="space-y-6">
      <DmHeader
        eyebrow="DM Screen"
        title="Combat"
        description="Initiative, turns, hit points and conditions, with every stat block one click away. Changes save automatically."
        action={<CampaignSwitcher />}
      />
      <EncounterList encounters={encounters} />
    </div>
  );
}
