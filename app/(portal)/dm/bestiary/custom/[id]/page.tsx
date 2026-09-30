import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CreatureView } from "@/components/views/dm/CreatureView";
import { requireDm } from "@/lib/dm/access";
import { CREATURE_ID, CreatureRepo } from "@/lib/dm/creatures";
import { getDatabase } from "@/lib/dm/database";

export const dynamic = "force-dynamic";

type Props = PageProps<"/dm/bestiary/custom/[id]">;

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { id } = await props.params;
  return { title: CREATURE_ID.test(id) ? (new CreatureRepo(getDatabase()).get(id)?.statBlock.name ?? "Creature") : "Creature" };
}

export default async function CustomCreaturePage(props: Props) {
  await requireDm();
  const { id } = await props.params;
  const creature = CREATURE_ID.test(id) ? new CreatureRepo(getDatabase()).get(id) : null;
  if (!creature) notFound();
  return <CreatureView creature={creature} />;
}
