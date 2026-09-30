import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoEncounter } from "@/components/demo/dm/DemoEncounter";
import { ENCOUNTER_ID } from "@/lib/dm/encounters";

export const metadata: Metadata = { title: "Encounter" };

export default async function DemoEncounterPage(props: PageProps<"/demo/dm/combat/[id]">) {
  const { id } = await props.params;
  if (!ENCOUNTER_ID.test(id)) notFound();
  return <DemoEncounter id={id} />;
}
