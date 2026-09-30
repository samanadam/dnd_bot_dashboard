import { Plus } from "lucide-react";
import { BestiaryBrowser } from "@/components/dm/BestiaryBrowser";
import { DmHeader, LinkButton } from "@/components/dm/DmHeader";
import type { MonsterSummary } from "@/lib/dm/monsterSummary";

// The DM Screen pages without their data source. The portal's pages read the
// database on the server and pass the result in; the demo's pages pass in what
// the browser-side demo store holds. Either way the same UI renders.

export function BestiaryView({ monsters, initialSource }: { monsters: MonsterSummary[]; initialSource: "all" | "custom" }) {
  return (
    <div className="space-y-6">
      <DmHeader
        eyebrow="DM Screen"
        title="Bestiary"
        description="The free SRD monsters from both rule sets, and the ones you add from your own books."
        action={
          <LinkButton href="/dm/creatures/new" icon={Plus} variant="primary">
            New monster
          </LinkButton>
        }
      />
      <BestiaryBrowser monsters={monsters} initialSource={initialSource} />
      <p className="text-xs text-faint">SRD 5.1 and 5.2 content by Wizards of the Coast LLC, licensed under CC-BY-4.0.</p>
    </div>
  );
}
