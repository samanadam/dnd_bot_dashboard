import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoEditCreature } from "@/components/demo/dm/DemoCreature";
import { CREATURE_ID } from "@/lib/dm/creatures";

export const metadata: Metadata = { title: "Edit creature" };

export default async function DemoEditCreaturePage(props: PageProps<"/demo/dm/creatures/[id]/edit">) {
  const { id } = await props.params;
  if (!CREATURE_ID.test(id)) notFound();
  return <DemoEditCreature id={id} />;
}
