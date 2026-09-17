"use client";

import { Minus, Plus, Search, UserPlus } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { useToast } from "@/components/Providers";
import { Button, inputClass } from "@/components/ui";
import { rollDice } from "@/lib/dice/roll";
import { dm, DmError } from "@/lib/dm/client";
import type { CreatureRef, NewCombatant } from "@/lib/dm/encounter";
import type { MonsterSummary } from "@/lib/dm/srd";
import { initiativeBonus, type StatBlock } from "@/lib/dm/statblock";
import { CrMedal } from "../BestiaryBrowser";

type HpMode = "average" | "roll";

function fromBlock(block: StatBlock, kind: "monster" | "npc", ref: CreatureRef, hpMode: HpMode): NewCombatant {
  let hp = block.hp;
  if (hpMode === "roll" && block.hitDice) {
    try {
      hp = Math.max(1, rollDice(block.hitDice).total);
    } catch {
      hp = block.hp;
    }
  }
  return {
    name: block.name,
    kind,
    ref,
    initiative: null,
    initiativeBonus: initiativeBonus(block),
    ac: block.ac,
    hp: Math.min(hp, 10_000),
    maxHp: Math.min(hp, 10_000),
    tempHp: 0,
    conditions: [],
    concentration: false,
    notes: "",
  };
}

export function AddCombatant({ creatures, onAdd, disabled }: { creatures: MonsterSummary[]; onAdd: (combatants: NewCombatant[]) => void; disabled?: boolean }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [count, setCount] = useState(1);
  const [hpMode, setHpMode] = useState<HpMode>("average");
  const [busy, setBusy] = useState<string | null>(null);
  const [player, setPlayer] = useState({ name: "", bonus: "", ac: "", hp: "" });

  const results = useMemo(() => {
    const q = deferred.trim().toLocaleLowerCase("en");
    if (q.length < 2) return [];
    return creatures
      .filter((c) => c.name.toLocaleLowerCase("en").includes(q))
      .sort((a, b) => {
        const aStarts = a.name.toLocaleLowerCase("en").startsWith(q) ? 0 : 1;
        const bStarts = b.name.toLocaleLowerCase("en").startsWith(q) ? 0 : 1;
        return aStarts - bStarts || (a.edition === "custom" ? -1 : 0) - (b.edition === "custom" ? -1 : 0) || a.name.localeCompare(b.name);
      })
      .slice(0, 8);
  }, [creatures, deferred]);

  async function add(summary: MonsterSummary) {
    setBusy(summary.id);
    try {
      let block: StatBlock;
      let kind: "monster" | "npc" = "monster";
      let ref: CreatureRef;
      if (summary.edition === "custom") {
        const creature = await dm.getCreature(summary.id);
        block = creature.statBlock;
        kind = creature.kind;
        ref = { source: "custom", id: creature.id };
      } else {
        block = await dm.getSrdBlock(summary.edition, summary.slug);
        ref = { source: "srd", edition: summary.edition, slug: summary.slug };
      }
      onAdd(Array.from({ length: count }, () => fromBlock(block, kind, ref, hpMode)));
      toast("ok", count > 1 ? `Added ${count} × ${block.name}.` : `Added ${block.name}.`);
      setQuery("");
      setCount(1);
    } catch (error) {
      toast("danger", error instanceof DmError ? error.message : "Could not load that stat block.");
    } finally {
      setBusy(null);
    }
  }

  const num = (value: string, min: number, max: number, fallback: number) => {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Monsters and NPCs</h3>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
            <label htmlFor="add-search" className="sr-only">
              Search monsters and NPCs
            </label>
            <input
              id="add-search"
              type="search"
              className={`${inputClass} pl-10`}
              placeholder="Type a name, e.g. goblin"
              value={query}
              maxLength={80}
              autoComplete="off"
              disabled={disabled}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="flex items-center rounded-xl border border-border bg-bg/60" role="group" aria-label="How many">
            <Button size="icon" variant="ghost" className="size-10" icon={Minus} aria-label="One fewer" disabled={count <= 1} onClick={() => setCount((n) => Math.max(1, n - 1))} />
            <span className="w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">
              {count}
            </span>
            <Button size="icon" variant="ghost" className="size-10" icon={Plus} aria-label="One more" disabled={count >= 20} onClick={() => setCount((n) => Math.min(20, n + 1))} />
          </div>
        </div>
        <div role="radiogroup" aria-label="Hit points" className="flex w-fit gap-1 rounded-xl border border-border bg-bg/40 p-1 text-xs">
          {(
            [
              ["average", "Average HP"],
              ["roll", "Roll HP"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={hpMode === value}
              onClick={() => setHpMode(value)}
              className={`rounded-lg px-2.5 py-1.5 font-medium transition ${hpMode === value ? "bg-surface-3 text-text shadow-card" : "text-muted hover:text-text"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {deferred.trim().length >= 2 ? (
          results.length ? (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {results.map((result) => (
                <li key={result.id} className="flex items-center gap-3 bg-surface-2/50 px-3 py-2">
                  <CrMedal cr={result.cr} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{result.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {result.edition === "custom" ? (result.kind === "npc" ? "Your NPC" : "Your monster") : `SRD ${result.edition}`} · AC {result.ac} · HP {result.hp}
                    </span>
                  </span>
                  <Button size="sm" variant="primary" icon={Plus} busy={busy === result.id} disabled={busy !== null} onClick={() => void add(result)}>
                    Add{count > 1 ? ` ${count}` : ""}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted">No monster or NPC with that name.</p>
          )
        ) : null}
      </div>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const name = player.name.trim();
          if (!name) return;
          const hp = num(player.hp, 1, 10_000, 10);
          onAdd([
            {
              name: name.slice(0, 80),
              kind: "player",
              ref: null,
              initiative: null,
              initiativeBonus: num(player.bonus, -20, 40, 0),
              ac: num(player.ac, 0, 40, 10),
              hp,
              maxHp: hp,
              tempHp: 0,
              conditions: [],
              concentration: false,
              notes: "",
            },
          ]);
          setPlayer({ name: "", bonus: "", ac: "", hp: "" });
        }}
      >
        <h3 className="text-sm font-semibold">Player character</h3>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-3">
            <label htmlFor="pc-name" className="text-xs text-muted">
              Name
            </label>
            <input id="pc-name" className={`${inputClass} mt-1`} value={player.name} maxLength={80} placeholder="Aria" disabled={disabled} onChange={(e) => setPlayer({ ...player, name: e.target.value })} />
          </div>
          {(
            [
              ["bonus", "Init bonus", "+2"],
              ["ac", "AC", "15"],
              ["hp", "Max HP", "24"],
            ] as const
          ).map(([key, label, placeholder]) => (
            <div key={key}>
              <label htmlFor={`pc-${key}`} className="text-xs text-muted">
                {label}
              </label>
              <input
                id={`pc-${key}`}
                inputMode="numeric"
                className={`${inputClass} mt-1 text-center tabular-nums`}
                placeholder={placeholder}
                value={player[key]}
                disabled={disabled}
                onChange={(e) => setPlayer({ ...player, [key]: e.target.value.replace(/[^0-9-]/g, "").slice(0, 5) })}
              />
            </div>
          ))}
        </div>
        <Button type="submit" icon={UserPlus} disabled={disabled || !player.name.trim()} className="w-full">
          Add player
        </Button>
      </form>
    </div>
  );
}
