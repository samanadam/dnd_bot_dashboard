import type { Metadata } from "next";
import { BestiaryView } from "@/components/views/dm/BestiaryView";
import { requireDm } from "@/lib/dm/access";
import { CreatureRepo } from "@/lib/dm/creatures";
import { getDatabase } from "@/lib/dm/database";
import { listSrd } from "@/lib/dm/srd";
import { customSummary, sourceLabel, withoutSuperseded } from "@/lib/dm/superseded";

export const metadata: Metadata = { title: "Bestiary" };
export const dynamic = "force-dynamic";

export default async function BestiaryPage(props: PageProps<"/dm/bestiary">) {
  await requireDm();
  const search = await props.searchParams;
  const repo = new CreatureRepo(getDatabase());
  const custom = repo.list("monster").map(customSummary);
  return <BestiaryView monsters={[...custom, ...withoutSuperseded(listSrd(), repo.supersededSrd())]} initialSource={search.source === "custom" ? "custom" : "all"} books={repo.listSources().map((s) => ({ ...s, label: sourceLabel(s.source) }))} />;
}
