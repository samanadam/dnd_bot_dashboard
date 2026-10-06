import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CreatureView } from "@/components/views/dm/CreatureView";
import { requireDm } from "@/lib/dm/access";
import { CREATURE_ID, CreatureRepo } from "@/lib/dm/creatures";
import { getDatabase } from "@/lib/dm/database";

export const dynamic = "force-dynamic";

type Props = PageProps<"/dm/bestiary/custom/[id]">;

/** The creature, when the caller's DM access reaches it: library monsters always, NPCs by campaign. */
async function reachable(props: Props) {
  const { scope } = await requireDm();
  const { id } = await props.params;
  const creature = CREATURE_ID.test(id) ? new CreatureRepo(getDatabase()).get(id) : null;
  return creature && (creature.kind === "monster" || scope.allows(creature.campaignId)) ? creature : null;
}

// Gated like the page: the title must not name a creature the visitor may not see.
export async function generateMetadata(props: Props): Promise<Metadata> {
  return { title: (await reachable(props))?.statBlock.name ?? "Creature" };
}

export default async function CustomCreaturePage(props: Props) {
  const creature = await reachable(props);
  if (!creature) notFound();
  return <CreatureView creature={creature} />;
}
