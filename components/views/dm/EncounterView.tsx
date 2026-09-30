import { ChevronLeft } from "lucide-react";
import { PortalLink } from "@/components/PortalLink";
import { CombatTracker } from "@/components/dm/combat/CombatTracker";
import { SoundboardDrawer } from "@/components/dm/SoundboardDrawer";
import type { StoredEncounter } from "@/lib/dm/encounters";
import type { MonsterSummary } from "@/lib/dm/monsterSummary";

// The DM Screen pages without their data source. The portal's pages read the
// database on the server and pass the result in; the demo's pages pass in what
// the browser-side demo store holds. Either way the same UI renders.

export function EncounterView({ stored, creatures }: { stored: StoredEncounter; creatures: MonsterSummary[] }) {
  return (
    <div className="space-y-4">
      <PortalLink href="/dm/combat" className="inline-flex items-center gap-1 text-sm text-muted transition hover:text-text">
        <ChevronLeft className="size-4" aria-hidden /> All encounters
      </PortalLink>
      {/* Keyed by id so opening another encounter never reuses this one's local state. */}
      <CombatTracker key={stored.id} initial={stored} creatures={creatures} />
      <SoundboardDrawer />
    </div>
  );
}
