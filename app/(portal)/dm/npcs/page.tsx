import { Plus, Users } from "lucide-react";
import type { Metadata } from "next";
import { NpcDirectory } from "@/components/dm/NpcDirectory";
import { DmHeader, LinkButton } from "@/components/dm/DmHeader";
import { EmptyState } from "@/components/ui";
import { requireDm } from "@/lib/dm/access";
import { CreatureRepo } from "@/lib/dm/creatures";
import { getDatabase } from "@/lib/dm/database";

export const metadata: Metadata = { title: "NPCs" };
export const dynamic = "force-dynamic";

export default async function NpcsPage() {
  await requireDm();
  const npcs = new CreatureRepo(getDatabase())
    .list("npc")
    .map((npc) => ({
      id: npc.id,
      name: npc.statBlock.name,
      type: npc.statBlock.type,
      cr: npc.statBlock.cr,
      ac: npc.statBlock.ac,
      hp: npc.statBlock.hp,
      tags: npc.tags,
      // Only the start of the notes leaves the server for the list view.
      teaser: npc.notes.slice(0, 160),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <DmHeader
        eyebrow="DM Screen"
        title="NPCs"
        description="The people of your world: stat blocks, private notes and tags to find them again."
        action={
          <LinkButton href="/dm/creatures/new?kind=npc" icon={Plus} variant="primary">
            New NPC
          </LinkButton>
        }
      />
      {npcs.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border py-6">
          <EmptyState icon={Users} title="No NPCs yet">
            Add the innkeeper, the villain and everyone in between. Only you can see them.
          </EmptyState>
        </div>
      ) : (
        <NpcDirectory npcs={npcs} />
      )}
    </div>
  );
}
