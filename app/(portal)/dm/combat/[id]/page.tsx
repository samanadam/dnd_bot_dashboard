import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EncounterView } from "@/components/views/dm/EncounterView";
import { AreaRepo } from "@/lib/dm/areas";
import { areaDetail } from "@/lib/dm/areaView";
import { requireDm } from "@/lib/dm/access";
import { CreatureRepo } from "@/lib/dm/creatures";
import { getDatabase } from "@/lib/dm/database";
import { ENCOUNTER_ID, EncounterRepo } from "@/lib/dm/encounters";
import { refLookup } from "@/lib/dm/routeDeps";
import { listSrd, summarise } from "@/lib/dm/srd";

export const metadata: Metadata = { title: "Encounter" };
export const dynamic = "force-dynamic";

export default async function EncounterPage(props: PageProps<"/dm/combat/[id]">) {
  const { scope } = await requireDm();
  const { id } = await props.params;
  if (!ENCOUNTER_ID.test(id)) notFound();
  const db = getDatabase();
  const encounters = new EncounterRepo(db);
  const stored = encounters.get(id);
  if (!stored || !scope.allows(stored.campaignId)) notFound();
  const custom = new CreatureRepo(db)
    .list()
    .filter((c) => c.kind === "monster" || scope.allows(c.campaignId))
    .map((c) => summarise(c.id, c.id, "custom", c.kind, c.statBlock, c.tags));
  // The area this battle belongs to, so its loot shows beside it. A launched copy
  // shows the loot of the prepared battle it came from.
  const areas = new AreaRepo(db);
  const battleId = stored.kind === "prepared" ? id : encounters.sourceId(id);
  const areaId = battleId ? areas.areaIdForEncounter(battleId) : null;
  const found = areaId ? areas.get(areaId) : null;
  const area = found && scope.allows(found.campaignId) ? areaDetail(found, { areas, encounters, lookup: refLookup() }) : null;
  return <EncounterView stored={stored} creatures={[...custom, ...listSrd()]} area={area} battleId={battleId} />;
}
