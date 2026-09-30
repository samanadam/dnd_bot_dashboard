import type { Metadata } from "next";
import { NewCreatureView } from "@/components/views/dm/NewCreatureView";
import { demoSrdBlock } from "@/lib/demo/srd";

export const metadata: Metadata = { title: "New creature" };

export default async function DemoNewCreaturePage(props: PageProps<"/demo/dm/creatures/new">) {
  const search = await props.searchParams;
  const [edition, slug] = typeof search.copy === "string" ? search.copy.split("/") : [];
  const source = typeof edition === "string" && typeof slug === "string" ? demoSrdBlock(edition, slug) : null;
  return <NewCreatureView kind={search.kind === "npc" ? "npc" : "monster"} source={source} />;
}
