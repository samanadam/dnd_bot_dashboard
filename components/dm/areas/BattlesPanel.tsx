"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ClipboardList, Play, Plus, Swords, Unlink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/Providers";
import { Button, EmptyState, inputBaseClass } from "@/components/ui";
import type { AreaDetail } from "@/lib/dm/areaView";
import { MAX_BATTLES } from "@/lib/dm/areas";
import { dm, DmError } from "@/lib/dm/client";

/** The prepared encounters linked to an area. Launching one copies it into a live fight, as in Combat. */
export function BattlesPanel({ detail, busy, onReplace }: { detail: AreaDetail; busy: boolean; onReplace: (encounterIds: string[]) => Promise<boolean> }) {
  const router = useRouter();
  const toast = useToast();
  const [pick, setPick] = useState("");
  const [launching, setLaunching] = useState<string | null>(null);
  const { battles } = detail;
  const ids = battles.map((battle) => battle.id);

  const encounters = useQuery({ queryKey: ["dm", "encounters"], queryFn: dm.listEncounters, staleTime: 10_000 });
  const available = (encounters.data ?? []).filter((encounter) => encounter.kind === "prepared" && !ids.includes(encounter.id));

  async function launch(id: string) {
    setLaunching(id);
    try {
      const started = await dm.launchEncounter(id);
      router.push(`/dm/combat/${started.id}`);
    } catch (error) {
      toast("danger", error instanceof DmError ? error.message : "Could not launch the encounter.");
      setLaunching(null);
    }
  }

  const move = (index: number, by: -1 | 1) => {
    const next = [...ids];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    void onReplace(next);
  };

  return (
    <section className="space-y-3" aria-label="Battles">
      <h2 className="font-display text-xl font-semibold">Battles</h2>

      {battles.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border py-4">
          <EmptyState icon={Swords} title="No battles yet">
            Link the prepared encounters that can happen here.
          </EmptyState>
        </div>
      ) : (
        <ul className="space-y-2">
          {battles.map((battle, index) => (
            <li key={battle.id} className="flex items-center gap-3 rounded-3xl border border-dashed border-accent/40 bg-surface p-3 pl-4 shadow-card">
              <ClipboardList className="size-5 shrink-0 text-accent" aria-hidden />
              <div className="min-w-0 flex-1">
                {battle.name === null ? (
                  <p className="font-medium text-warn">Missing battle</p>
                ) : (
                  <Link href={`/dm/combat/${battle.id}`} className="block truncate font-medium hover:text-accent">
                    {battle.name}
                  </Link>
                )}
                <p className="text-xs text-muted">
                  {battle.name === null ? "It was deleted. Unlink it." : `${battle.combatants} combatant${battle.combatants === 1 ? "" : "s"}${battle.prepared ? "" : " · no longer prepared"}`}
                </p>
              </div>
              {battle.name !== null && battle.prepared ? (
                <Button size="sm" variant="primary" icon={Play} busy={launching === battle.id} disabled={battle.combatants === 0 || launching !== null} onClick={() => void launch(battle.id)}>
                  Launch
                </Button>
              ) : null}
              <Button size="icon" variant="ghost" className="size-8" icon={ArrowUp} aria-label="Move up" disabled={index === 0 || busy} onClick={() => move(index, -1)} />
              <Button size="icon" variant="ghost" className="size-8" icon={ArrowDown} aria-label="Move down" disabled={index === battles.length - 1 || busy} onClick={() => move(index, 1)} />
              <Button size="icon" variant="danger-ghost" className="size-8" icon={Unlink} aria-label={`Unlink ${battle.name ?? "missing battle"}`} disabled={busy} onClick={() => void onReplace(ids.filter((id) => id !== battle.id))} />
            </li>
          ))}
        </ul>
      )}

      {battles.length < MAX_BATTLES ? (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="area-battle-add" className="sr-only">
            Prepared encounter to link
          </label>
          <select id="area-battle-add" className={`${inputBaseClass} h-10 min-w-0 flex-1`} value={pick} onChange={(event) => setPick(event.target.value)} disabled={available.length === 0}>
            <option value="">{available.length ? "Link a prepared encounter…" : "No unlinked prepared encounter"}</option>
            {available.map((encounter) => (
              <option key={encounter.id} value={encounter.id}>
                {encounter.name} ({encounter.combatants})
              </option>
            ))}
          </select>
          <Button
            icon={Plus}
            disabled={!pick || busy}
            onClick={async () => {
              if (await onReplace([...ids, pick])) setPick("");
            }}
          >
            Link
          </Button>
          <Link href="/dm/combat" className="text-xs text-muted underline-offset-2 hover:text-text hover:underline">
            Prepare one in Combat
          </Link>
        </div>
      ) : null}
    </section>
  );
}
