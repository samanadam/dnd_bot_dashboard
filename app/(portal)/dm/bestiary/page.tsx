import type { Metadata } from "next";
import { BestiaryView } from "@/components/views/dm/BestiaryView";
import { requireDm } from "@/lib/dm/access";
import { CreatureRepo } from "@/lib/dm/creatures";
import { getDatabase } from "@/lib/dm/database";
import { listSrd, summarise } from "@/lib/dm/srd";

export const metadata: Metadata = { title: "Bestiary" };
export const dynamic = "force-dynamic";

export default async function BestiaryPage(props: PageProps<"/dm/bestiary">) {
  await requireDm();
  const search = await props.searchParams;
  const custom = new CreatureRepo(getDatabase())
    .list("monster")
    .map((c) => summarise(c.id, c.id, "custom", c.kind, c.statBlock, c.tags));
  return <BestiaryView monsters={[...custom, ...listSrd()]} initialSource={search.source === "custom" ? "custom" : "all"} />;
}
