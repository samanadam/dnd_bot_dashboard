import { CreatureForm } from "@/components/dm/CreatureForm";
import { DmHeader } from "@/components/dm/DmHeader";
import type { CreatureInput, CreatureKind } from "@/lib/dm/creatures";
import type { StatBlock } from "@/lib/dm/statblock";

// The DM Screen pages without their data source. The portal's pages read the
// database on the server and pass the result in; the demo's pages pass in what
// the browser-side demo store holds. Either way the same UI renders.

export function NewCreatureView({ kind, source }: { kind: CreatureKind; source: StatBlock | null }) {
  const initial: CreatureInput | undefined = source ? { kind, statBlock: source, notes: "", tags: [] } : undefined;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <DmHeader
        back={kind === "npc" ? { href: "/dm/npcs", label: "NPCs" } : { href: "/dm/bestiary", label: "Bestiary" }}
        eyebrow={source ? `Copy of ${source.name}` : "DM Screen"}
        title={kind === "npc" ? "New NPC" : "New monster"}
        description="Type it in from your book, or start from an SRD monster and change what you need. Saved only on your server."
      />
      <CreatureForm kind={kind} initial={initial} />
    </div>
  );
}
