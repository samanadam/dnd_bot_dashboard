import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditCreatureView } from "@/components/views/dm/EditCreatureView";
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
  return <EditCreatureView creature={creature} />;
}
