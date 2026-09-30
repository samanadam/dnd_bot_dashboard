import { Plus } from "lucide-react";
import { CampaignSwitcher } from "@/components/CampaignSelect";
import { DmHeader, LinkButton } from "@/components/dm/DmHeader";
import { NpcDirectory, type NpcCard } from "@/components/dm/NpcDirectory";
import type { Creature } from "@/lib/dm/creatures";

// The DM Screen pages without their data source. The portal's pages read the
// database on the server and pass the result in; the demo's pages pass in what
// the browser-side demo store holds. Either way the same UI renders.

/** The NPC list card: only the start of the notes leaves the server. */
export function npcCards(npcs: Creature[]): NpcCard[] {
  return npcs
    .map((npc) => ({
      id: npc.id,
      name: npc.statBlock.name,
      type: npc.statBlock.type,
      cr: npc.statBlock.cr,
      ac: npc.statBlock.ac,
      hp: npc.statBlock.hp,
      tags: npc.tags,
      teaser: npc.notes.slice(0, 160),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function NpcsView({ npcs }: { npcs: NpcCard[] }) {
  return (
    <div className="space-y-6">
      <DmHeader
        eyebrow="DM Screen"
        title="NPCs"
        description="The people of your world: stat blocks, private notes and tags to find them again."
        action={
          <>
            <CampaignSwitcher />
            <LinkButton href="/dm/creatures/new?kind=npc" icon={Plus} variant="primary">
              New NPC
            </LinkButton>
          </>
        }
      />
      {/* The empty state lives in the client component: an icon component
          cannot be passed from here into one. */}
      <NpcDirectory npcs={npcs} />
    </div>
  );
}
