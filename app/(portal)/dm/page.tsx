import type { Metadata } from "next";
import { DmHomeView } from "@/components/views/dm/DmHomeView";
import { requireDm } from "@/lib/dm/access";
import { AreaRepo } from "@/lib/dm/areas";
import { CreatureRepo } from "@/lib/dm/creatures";
import { getDatabase } from "@/lib/dm/database";
import { EncounterRepo } from "@/lib/dm/encounters";
import { StoryRepo } from "@/lib/dm/story";
import { listSrd } from "@/lib/dm/srd";
import { withoutSuperseded } from "@/lib/dm/superseded";

export const metadata: Metadata = { title: "DM Screen" };
export const dynamic = "force-dynamic";

export default async function DmHome() {
  const { scope } = await requireDm();
  const mine = scope.narrow(null) ?? [];
  const db = getDatabase();
  const creatureRepo = new CreatureRepo(db);
  const creatures = creatureRepo.list().filter((c) => c.kind === "monster" || scope.allows(c.campaignId));
  const npcs = creatures.filter((c) => c.kind === "npc").length;
  return (
    <DmHomeView
      encounters={new EncounterRepo(db).list(mine)}
      monsterCount={withoutSuperseded(listSrd(), creatureRepo.supersededSrd()).length + creatures.length - npcs}
      npcCount={npcs}
      areaCount={new AreaRepo(db).list(mine).length}
      storyCount={new StoryRepo(db).list(mine).length}
    />
  );
}
