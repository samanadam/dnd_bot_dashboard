import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AreaView } from "@/components/views/dm/AreaView";
import { requireDm } from "@/lib/dm/access";
import { AREA_ID, AreaRepo } from "@/lib/dm/areas";
import { areaDetail } from "@/lib/dm/areaView";
import { getDatabase } from "@/lib/dm/database";
import { EncounterRepo } from "@/lib/dm/encounters";
import { refLookup } from "@/lib/dm/routeDeps";

export const metadata: Metadata = { title: "Area" };
export const dynamic = "force-dynamic";

export default async function AreaPage(props: PageProps<"/dm/areas/[id]">) {
  const { scope } = await requireDm();
  const { id } = await props.params;
  if (!AREA_ID.test(id)) notFound();
  const db = getDatabase();
  const areas = new AreaRepo(db);
  const found = areas.get(id);
  const area = found && scope.allows(found.campaignId) ? found : null;
  if (!area) notFound();
  return <AreaView detail={areaDetail(area, { areas, encounters: new EncounterRepo(db), lookup: refLookup() })} />;
}
