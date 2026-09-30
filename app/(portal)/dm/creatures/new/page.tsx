import type { Metadata } from "next";
import { NewCreatureView } from "@/components/views/dm/NewCreatureView";
import { requireDm } from "@/lib/dm/access";
import { getSrd, isEdition } from "@/lib/dm/srd";

export const metadata: Metadata = { title: "New creature" };

export default async function NewCreaturePage(props: PageProps<"/dm/creatures/new">) {
  await requireDm();
  const search = await props.searchParams;
  const [edition, slug] = typeof search.copy === "string" ? search.copy.split("/") : [];
  const source = isEdition(edition) && typeof slug === "string" ? getSrd(edition, slug) : null;
  return <NewCreatureView kind={search.kind === "npc" ? "npc" : "monster"} source={source} />;
}
