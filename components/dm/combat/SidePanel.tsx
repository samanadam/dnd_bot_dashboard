"use client";

import { useQuery } from "@tanstack/react-query";
import { ScrollText, UserRound } from "lucide-react";
import { PortalLink } from "@/components/PortalLink";
import { EmptyState, Skeleton, inputBaseClass } from "@/components/ui";
import { dm } from "@/lib/dm/client";
import { isPartySide, isRevealed, type Combatant, type CombatantPatch, type CreatureRef } from "@/lib/dm/encounter";
import { RollableStatBlock } from "../DiceProvider";

function refKey(ref: CreatureRef | null) {
  if (!ref) return ["none"];
  return ref.source === "srd" ? ["srd", ref.edition, ref.slug] : ["custom", ref.id];
}

/** What players see of this combatant on their battle page. */
function PlayerViewControls({ combatant, onPatch }: { combatant: Combatant; onPatch: (patch: CombatantPatch) => void }) {
  const party = isPartySide(combatant);
  const revealed = isRevealed(combatant);
  return (
    <div className="mb-4 space-y-2 rounded-2xl border border-border bg-bg/30 p-3 text-sm">
      <p className="text-xs font-semibold uppercase text-muted">Players see</p>
      <label className="block text-xs text-muted">
        Shown as
        <input
          className={`${inputBaseClass} mt-1 h-9 w-full`}
          maxLength={40}
          placeholder={party ? combatant.name : `Enemy ${combatant.playerNumber ?? ""}`.trim()}
          value={combatant.alias ?? ""}
          onChange={(event) => onPatch({ alias: event.target.value || null })}
        />
      </label>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" className="accent-[var(--accent)]" checked={revealed} onChange={(event) => onPatch({ revealed: event.target.checked })} />
          Real name revealed
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" className="accent-[var(--accent)]" checked={Boolean(combatant.hidden)} onChange={(event) => onPatch({ hidden: event.target.checked })} />
          Hidden from players
        </label>
      </div>
      <p className="text-xs text-faint">
        {combatant.hidden ? "Not on the players' list at all." : revealed ? `They see "${combatant.name}".` : `They see "${combatant.alias || `Enemy ${combatant.playerNumber ?? ""}`.trim()}".`} Never AC, hit points or stats.
      </p>
    </div>
  );
}

export function SidePanel({ combatant, onPatch }: { combatant: Combatant | undefined; onPatch?: (patch: CombatantPatch) => void }) {
  return (
    <>
      {combatant && onPatch ? <PlayerViewControls combatant={combatant} onPatch={onPatch} /> : null}
      <SidePanelContent combatant={combatant} />
    </>
  );
}

function SidePanelContent({ combatant }: { combatant: Combatant | undefined }) {
  // A player character's details are on their sheet, not in a stat block.
  const linked = combatant?.ref?.source === "character" ? combatant.ref : null;
  const ref: CreatureRef | null = combatant?.ref && combatant.ref.source !== "character" ? combatant.ref : null;
  const query = useQuery({
    queryKey: ["dm-statblock", ...refKey(ref)],
    enabled: ref !== null,
    staleTime: 60 * 60_000,
    retry: 1,
    queryFn: async () => {
      if (!ref) throw new Error("no reference");
      return ref.source === "srd" ? dm.getSrdBlock(ref.edition, ref.slug) : (await dm.getCreature(ref.id)).statBlock;
    },
  });

  if (!combatant) {
    return (
      <EmptyState icon={ScrollText} title="No one selected">
        Select a combatant to see its stat block. Every bonus on it can be rolled.
      </EmptyState>
    );
  }
  if (linked) {
    return (
      <EmptyState icon={UserRound} title={combatant.name}>
        <span>
          Hit points and conditions follow the character&apos;s sheet.{" "}
          <PortalLink href={`/dm/party/${linked.id}`} className="font-medium text-accent hover:underline">
            Open the sheet
          </PortalLink>
        </span>
      </EmptyState>
    );
  }
  if (!ref) {
    return (
      <EmptyState icon={UserRound} title={combatant.name}>
        A player character. Their sheet lives with the player.
      </EmptyState>
    );
  }
  if (query.isPending) {
    return (
      <div className="space-y-3" aria-busy>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <EmptyState icon={ScrollText} title="Stat block unavailable">
        It may have been deleted from your bestiary. The combatant&apos;s numbers here still work.
      </EmptyState>
    );
  }
  return <RollableStatBlock block={query.data} compact />;
}
