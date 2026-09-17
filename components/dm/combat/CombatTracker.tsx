"use client";

import { Check, ChevronLeft, ChevronRight, CloudOff, Dices, Flag, Loader, Play, Plus, Swords, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, EmptyState, Notice } from "@/components/ui";
import { secureRng } from "@/lib/dice/random";
import {
  addCombatant,
  damage,
  endCombat,
  heal,
  MAX_COMBATANTS,
  nextTurn,
  patchCombatant,
  previousTurn,
  removeCombatant,
  renameEncounter,
  rollInitiative,
  setInitiative,
  setTempHp,
  startCombat,
  toggleCondition,
} from "@/lib/dm/encounter";
import type { StoredEncounter } from "@/lib/dm/encounters";
import type { MonsterSummary } from "@/lib/dm/srd";
import { AddCombatant } from "./AddCombatant";
import { CombatantRow } from "./CombatantRow";
import { SidePanel } from "./SidePanel";
import { useEncounter, type SaveStatus } from "./useEncounter";

const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

function SaveIndicator({ status }: { status: SaveStatus }) {
  const map = {
    saved: { icon: Check, text: "Saved", tone: "text-muted" },
    pending: { icon: Loader, text: "Saving…", tone: "text-muted" },
    saving: { icon: Loader, text: "Saving…", tone: "text-muted" },
    offline: { icon: CloudOff, text: "Offline, retrying", tone: "text-warn" },
    conflict: { icon: TriangleAlert, text: "Not saved", tone: "text-danger" },
  }[status];
  const Icon = map.icon;
  return (
    <span className={`flex items-center gap-1.5 text-xs ${map.tone}`} role="status" aria-live="polite">
      <Icon className={`size-3.5 ${status === "saving" || status === "pending" ? "animate-spin" : ""}`} aria-hidden />
      {map.text}
    </span>
  );
}

export function CombatTracker({ initial, creatures }: { initial: StoredEncounter; creatures: MonsterSummary[] }) {
  const { encounter, apply, status, conflict, acceptServerVersion, keepMine } = useEncounter(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(initial.encounter.combatants.length === 0);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const started = encounter.round > 0;
  const active = started ? encounter.combatants[encounter.turn] : undefined;
  const selected = encounter.combatants.find((c) => c.id === selectedId) ?? active ?? encounter.combatants[0];
  const unrolled = encounter.combatants.filter((c) => c.kind !== "player" && c.initiative === null);
  const missingPlayers = encounter.combatants.filter((c) => c.kind === "player" && c.initiative === null);
  const locked = status === "conflict";

  // Follow the turn: the new actor's row scrolls into view and its stat block opens.
  useEffect(() => {
    if (!active) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- selection follows the turn by design
    setSelectedId(active.id);
    document.getElementById(`combatant-${active.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active?.id, encounter.round]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: N or → next turn, P or ← previous, while not typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!started || locked || event.metaKey || event.ctrlKey || event.altKey) return;
      if (target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)) return;
      if (event.key === "n" || event.key === "ArrowRight") {
        event.preventDefault();
        apply(nextTurn);
      } else if (event.key === "p" || event.key === "ArrowLeft") {
        event.preventDefault();
        apply(previousTurn);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [apply, started, locked]);

  return (
    <div className="space-y-5">
      {conflict ? (
        <Notice tone="warn" title="This encounter was changed in another tab or device">
          <span className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={acceptServerVersion}>
              Load the other version
            </Button>
            <Button size="sm" variant="ghost" onClick={keepMine}>
              Keep this tab&apos;s version
            </Button>
          </span>
        </Notice>
      ) : null}

      <section className="rounded-3xl border border-border bg-surface p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="encounter-name" className="sr-only">
              Encounter name
            </label>
            <input
              id="encounter-name"
              className="w-full min-w-0 truncate rounded-lg bg-transparent font-display text-2xl font-bold tracking-tight focus:outline-none focus:ring-2 focus:ring-accent-soft sm:text-3xl"
              value={nameDraft ?? encounter.name}
              maxLength={80}
              disabled={locked}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={() => {
                if (nameDraft !== null) apply((e) => renameEncounter(e, nameDraft));
                setNameDraft(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") (event.target as HTMLInputElement).blur();
              }}
            />
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${started ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted"}`}>
                {started ? `Round ${encounter.round}` : "Not started"}
              </span>
              <span className="text-xs text-muted">
                {encounter.combatants.length} combatant{encounter.combatants.length === 1 ? "" : "s"}
              </span>
              <SaveIndicator status={status} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button icon={Plus} onClick={() => setAdding((open) => !open)} aria-expanded={adding} disabled={locked}>
              Add
            </Button>
            <Button
              icon={Dices}
              disabled={locked || unrolled.length === 0}
              title={unrolled.length ? "Roll initiative for monsters and NPCs without one" : "Everyone has initiative"}
              onClick={() => apply((e) => rollInitiative(e, unrolled.map((c) => c.id), secureRng))}
            >
              Roll initiative
            </Button>
            {started ? (
              <>
                <Button size="icon" icon={ChevronLeft} aria-label="Previous turn (P)" disabled={locked} onClick={() => apply(previousTurn)} />
                <Button variant="primary" size="lg" icon={ChevronRight} disabled={locked} onClick={() => apply(nextTurn)}>
                  Next turn
                </Button>
                <Button size="icon" variant="ghost" icon={Flag} aria-label="End combat" title="End combat" disabled={locked} onClick={() => apply(endCombat)} />
              </>
            ) : (
              <Button variant="primary" size="lg" icon={Play} disabled={locked || encounter.combatants.length === 0} onClick={() => apply(startCombat)}>
                Start combat
              </Button>
            )}
          </div>
        </div>
        {!started && missingPlayers.length > 0 && encounter.combatants.length > 0 ? (
          <p className="mt-3 text-xs text-muted">
            Type the players&apos; initiative into their boxes, then start. Anyone without initiative goes last.
          </p>
        ) : null}
      </section>

      {adding ? (
        <section className="rounded-3xl border border-border bg-surface p-4 shadow-card sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Add to the encounter</h2>
            <Button size="icon" variant="ghost" className="size-8" icon={X} aria-label="Close" onClick={() => setAdding(false)} />
          </div>
          <AddCombatant
            creatures={creatures}
            disabled={locked || encounter.combatants.length >= MAX_COMBATANTS}
            onAdd={(list) =>
              apply((e) => {
                let next = e;
                for (const combatant of list) next = addCombatant(next, combatant, newId);
                return next;
              })
            }
          />
        </section>
      ) : null}

      {encounter.combatants.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border py-8">
          <EmptyState icon={Swords} title="An empty battlefield">
            Add monsters from your bestiary and the players, then roll initiative.
          </EmptyState>
        </div>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
          <ol ref={listRef} className="space-y-2.5" aria-label="Initiative order">
            {encounter.combatants.map((c) => (
              <CombatantRow
                key={c.id}
                combatant={c}
                active={c.id === active?.id}
                selected={c.id === selected?.id}
                combatStarted={started}
                onSelect={() => setSelectedId(c.id)}
                onDamage={(n) => apply((e) => damage(e, c.id, n))}
                onHeal={(n) => apply((e) => heal(e, c.id, n))}
                onTemp={(n) => apply((e) => setTempHp(e, c.id, n))}
                onInitiative={(value) => apply((e) => setInitiative(e, c.id, value))}
                onToggleCondition={(name, rounds) => apply((e) => toggleCondition(e, c.id, name, rounds))}
                onConcentration={(value) => apply((e) => patchCombatant(e, c.id, { concentration: value }))}
                onRemove={() => apply((e) => removeCombatant(e, c.id))}
              />
            ))}
          </ol>
          <aside className="rounded-3xl border border-border bg-surface p-5 shadow-card xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto" aria-label="Stat block">
            <SidePanel combatant={selected} />
          </aside>
        </div>
      )}

      <p className="hidden text-xs text-faint lg:block">
        Shortcuts: <kbd className="rounded border border-border px-1 font-mono">N</kbd> next turn, <kbd className="rounded border border-border px-1 font-mono">P</kbd> previous turn.
      </p>
    </div>
  );
}
