import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CreatureForm } from "@/components/dm/CreatureForm";
import { DmHeader } from "@/components/dm/DmHeader";
import { requireDm } from "@/lib/dm/access";
import { CREATURE_ID, CreatureRepo } from "@/lib/dm/creatures";
import { getDatabase } from "@/lib/dm/database";

export const metadata: Metadata = { title: "Edit creature" };
export const dynamic = "force-dynamic";

export default async function EditCreaturePage(props: PageProps<"/dm/creatures/[id]/edit">) {
  await requireDm();
  const { id } = await props.params;
  const creature = CREATURE_ID.test(id) ? new CreatureRepo(getDatabase()).get(id) : null;
  if (!creature) notFound();

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
