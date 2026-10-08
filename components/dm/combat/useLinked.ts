"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { useToast } from "@/components/Providers";
import { DmError } from "@/lib/dm/client";
import type { Combatant, Encounter } from "@/lib/dm/encounter";
import { sheets } from "@/lib/sheets/client";
import type { Op } from "@/lib/sheets/ops";
import type { LinkedVitals } from "@/lib/sheets/routes";

const sheetOf = (c: Combatant) => (c.ref?.source === "character" ? c.ref.id : null);

const sameConditions = (a: Combatant["conditions"], b: Combatant["conditions"]) =>
  a.length === b.length && a.every((c, i) => c.name === b[i].name && c.rounds === b[i].rounds);

/** The encounter's copy of a linked combatant, brought in line with its sheet; the same object when nothing differs. */
export function mergeLinked(c: Combatant, live: LinkedVitals | undefined): Combatant {
  if (!live) return c;
  const next = {
    ...c,
    hp: Math.min(live.hp, live.maxHp),
    tempHp: live.tempHp,
    maxHp: Math.max(1, live.maxHp),
    ac: Math.max(0, Math.min(40, live.ac)),
    initiativeBonus: Math.max(-20, Math.min(40, live.initiativeBonus)),
    conditions: live.conditions.slice(0, 12),
    concentration: live.concentration !== null,
  };
  const same =
    next.hp === c.hp &&
    next.tempHp === c.tempHp &&
    next.maxHp === c.maxHp &&
    next.ac === c.ac &&
    next.initiativeBonus === c.initiativeBonus &&
    next.concentration === c.concentration &&
    sameConditions(next.conditions, c.conditions);
  return same ? c : next;
}

/**
 * Character sheets in the fight. Their hit points, conditions and concentration
 * live on the sheet: the tracker sends changes there as operations, and polls
 * the sheets so a player's own changes show up here within a couple of seconds.
 * The encounter keeps a copy, refreshed from each poll.
 */
export function useLinked(encounter: Encounter, apply: (change: (current: Encounter) => Encounter) => void, locked: boolean) {
  const toast = useToast();
  const ids = [...new Set(encounter.combatants.map(sheetOf).filter((id): id is string => id !== null))].sort();
  const live = useQuery({
    queryKey: ["linked-vitals", ids.join(",")],
    queryFn: () => sheets.vitalsBatch(ids),
    enabled: ids.length > 0,
    refetchInterval: 2000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const data = live.data;
    if (!data || locked) return;
    apply((current) => {
      let changed = false;
      const combatants = current.combatants.map((c) => {
        const id = sheetOf(c);
        const merged = id ? mergeLinked(c, data[id]) : c;
        if (merged !== c) changed = true;
        return merged;
      });
      return changed ? { ...current, combatants } : current;
    });
  }, [live.data, apply, locked]);

  /** Sends operations to a linked combatant's sheet; refreshes the copy afterwards. */
  const send = useCallback(
    async (c: Combatant, ops: Op[]) => {
      const id = sheetOf(c);
      if (!id) return;
      try {
        await sheets.ops(id, ops);
        void live.refetch();
      } catch (error) {
        toast("danger", error instanceof DmError ? error.message : `${c.name}'s sheet did not take that change.`);
        void live.refetch();
      }
    },
    [live, toast],
  );

  const owners = new Map<string, string>();
  for (const c of encounter.combatants) {
    const id = sheetOf(c);
    const owner = id ? live.data?.[id]?.ownerUserId : null;
    if (owner) owners.set(c.id, owner);
  }

  return { linked: (c: Combatant) => sheetOf(c) !== null, send, owners, live: live.data ?? {} };
}
