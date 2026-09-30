import { CreatureForm } from "@/components/dm/CreatureForm";
import { DmHeader } from "@/components/dm/DmHeader";
import type { Creature } from "@/lib/dm/creatures";

// The DM Screen pages without their data source. The portal's pages read the
// database on the server and pass the result in; the demo's pages pass in what
// the browser-side demo store holds. Either way the same UI renders.

export function EditCreatureView({ creature }: { creature: Creature }) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <DmHeader back={{ href: `/dm/bestiary/custom/${creature.id}`, label: creature.statBlock.name }} eyebrow="Edit" title={creature.statBlock.name} />
      <CreatureForm
        id={creature.id}
        initial={{
          kind: creature.kind,
          statBlock: creature.statBlock,
          notes: creature.notes,
          tags: creature.tags,
          campaignId: creature.campaignId,
        }}
      />
    </div>
  );
}
