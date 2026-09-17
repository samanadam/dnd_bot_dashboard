import type { Metadata } from "next";
import { CreatureForm } from "@/components/dm/CreatureForm";
import { DmHeader } from "@/components/dm/DmHeader";
import { requireDm } from "@/lib/dm/access";
import { getSrd, isEdition } from "@/lib/dm/srd";

export const metadata: Metadata = { title: "New creature" };

export default async function NewCreaturePage(props: PageProps<"/dm/creatures/new">) {
  await requireDm();
  const search = await props.searchParams;
  const kind = search.kind === "npc" ? "npc" : "monster";
  const [edition, slug] = typeof search.copy === "string" ? search.copy.split("/") : [];
  const source = isEdition(edition) && typeof slug === "string" ? getSrd(edition, slug) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <DmHeader
        back={kind === "npc" ? { href: "/dm/npcs", label: "NPCs" } : { href: "/dm/bestiary", label: "Bestiary" }}
        eyebrow={source ? `Copy of ${source.name}` : "DM Screen"}
        title={kind === "npc" ? "New NPC" : "New monster"}
        description="Type it in from your book, or start from an SRD monster and change what you need. Saved only on your server."
      />
      <CreatureForm kind={kind} initial={source ? { kind, statBlock: source, notes: "", tags: [] } : undefined} />
    </div>
  );
}
