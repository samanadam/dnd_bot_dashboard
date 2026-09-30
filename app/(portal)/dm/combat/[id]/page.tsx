import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EncounterView } from "@/components/views/dm/EncounterView";
import { requireDm } from "@/lib/dm/access";
import { CreatureRepo } from "@/lib/dm/creatures";
import { getDatabase } from "@/lib/dm/database";
import { ENCOUNTER_ID, EncounterRepo } from "@/lib/dm/encounters";
import { listSrd, summarise } from "@/lib/dm/srd";

export const metadata: Metadata = { title: "Encounter" };
export const dynamic = "force-dynamic";

export default async function EncounterPage(props: PageProps<"/dm/combat/[id]">) {
  await requireDm();
  const { id } = await props.params;
  if (!ENCOUNTER_ID.test(id)) notFound();
  const db = getDatabase();
  const stored = new EncounterRepo(db).get(id);
  if (!stored) notFound();
  const custom = new CreatureRepo(db).list().map((c) => summarise(c.id, c.id, "custom", c.kind, c.statBlock, c.tags));
  return <EncounterView stored={stored} creatures={[...custom, ...listSrd()]} />;
}
