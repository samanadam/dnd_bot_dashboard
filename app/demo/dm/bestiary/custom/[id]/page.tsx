import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoCreature } from "@/components/demo/dm/DemoCreature";
import { CREATURE_ID } from "@/lib/dm/creatures";

export const metadata: Metadata = { title: "Creature" };

export default async function DemoCreaturePage(props: PageProps<"/demo/dm/bestiary/custom/[id]">) {
  const { id } = await props.params;
  if (!CREATURE_ID.test(id)) notFound();
  return <DemoCreature id={id} />;
}
