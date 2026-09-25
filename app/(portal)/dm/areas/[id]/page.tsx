import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AreaDetailView } from "@/components/dm/areas/AreaDetailView";
import { DmHeader } from "@/components/dm/DmHeader";
import { requireDm } from "@/lib/dm/access";
import { AREA_ID, AreaRepo } from "@/lib/dm/areas";
import { areaDetail } from "@/lib/dm/areaView";
import { getDatabase } from "@/lib/dm/database";
import { EncounterRepo } from "@/lib/dm/encounters";
import { refLookup } from "@/lib/dm/routeDeps";

export const metadata: Metadata = { title: "Area" };
export const dynamic = "force-dynamic";

export default async function AreaPage(props: PageProps<"/dm/areas/[id]">) {
  await requireDm();
  const { id } = await props.params;
  if (!AREA_ID.test(id)) notFound();
  const db = getDatabase();
  const areas = new AreaRepo(db);
  const area = areas.get(id);
  if (!area) notFound();
  const detail = areaDetail(area, { areas, encounters: new EncounterRepo(db), lookup: refLookup() });

  return (
    <div className="space-y-6">
      <DmHeader back={{ href: "/dm/areas", label: "All areas" }} eyebrow="Area" title={area.name} />
      {/* Keyed by id and version so a reload from the server replaces the local copy. */}
      <AreaDetailView key={`${area.id}:${area.version}`} initial={detail} />
    </div>
  );
}
