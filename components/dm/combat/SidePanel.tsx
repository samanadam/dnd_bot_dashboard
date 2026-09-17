"use client";

import { useQuery } from "@tanstack/react-query";
import { ScrollText, UserRound } from "lucide-react";
import { EmptyState, Skeleton } from "@/components/ui";
import { dm } from "@/lib/dm/client";
import type { Combatant, CreatureRef } from "@/lib/dm/encounter";
import { RollableStatBlock } from "../DiceProvider";

function refKey(ref: CreatureRef | null) {
  if (!ref) return ["none"];
  return ref.source === "srd" ? ["srd", ref.edition, ref.slug] : ["custom", ref.id];
}

export function SidePanel({ combatant }: { combatant: Combatant | undefined }) {
  const ref = combatant?.ref ?? null;
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
