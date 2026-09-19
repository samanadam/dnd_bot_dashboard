"use client";

import { Brain, ChevronDown, Heart, HeartPulse, Minus, Plus, Shield, ShieldPlus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, inputBaseClass } from "@/components/ui";
import { CONDITIONS, conditionHint } from "@/lib/dm/conditions";
import { healthState, type Combatant } from "@/lib/dm/encounter";
import { formatModifier } from "@/lib/dm/statblock";

type Props = {
  combatant: Combatant;
  active: boolean;
  selected: boolean;
  combatStarted: boolean;
  onSelect: () => void;
  onDamage: (amount: number) => void;
  onHeal: (amount: number) => void;
  onTemp: (amount: number) => void;
  onInitiative: (value: number | null) => void;
  onToggleCondition: (name: string, rounds: number | null) => void;
  onConcentration: (value: boolean) => void;
  onRemove: () => void;
};

const KIND_LABEL = { monster: "Monster", npc: "NPC", player: "Player" } as const;

export function CombatantRow(props: Props) {
  const { combatant: c } = props;
  const [expanded, setExpanded] = useState(false);
  const [amount, setAmount] = useState("");
  const [rounds, setRounds] = useState("");
  const [concentrationDc, setConcentrationDc] = useState<number | null>(null);
  const [initDraft, setInitDraft] = useState<string | null>(null);

  const value = Math.min(100_000, Math.max(0, Number.parseInt(amount, 10) || 0));
  const state = healthState(c);
  const percent = Math.round((Math.min(c.hp, c.maxHp) / c.maxHp) * 100);
  const tempPercent = Math.min(100, Math.round((c.tempHp / c.maxHp) * 100));
  const barColor = state === "down" ? "bg-danger" : state === "bloodied" ? "bg-warn" : "bg-ok";
  const rowId = `combatant-${c.id}`;

  const hit = () => {
    if (!value) return;
    props.onDamage(value);
    if (c.concentration && c.hp + c.tempHp > 0) setConcentrationDc(Math.max(10, Math.floor(value / 2)));
    setAmount("");
  };

  const commitInitiative = () => {
    if (initDraft === null) return;
    const trimmed = initDraft.trim();
    props.onInitiative(trimmed === "" ? null : Number.parseInt(trimmed, 10));
    setInitDraft(null);
  };

  return (
    <li
      id={rowId}
      aria-current={props.active ? "true" : undefined}
      className={`relative rounded-2xl border bg-surface shadow-card transition ${
        props.active ? "turn-pulse border-accent" : props.selected ? "border-border-strong" : "border-border"
      } ${state === "down" ? "opacity-70" : ""}`}
    >
      {props.active ? <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-accent" aria-hidden /> : null}
      <div className="flex items-center gap-3 p-3 pl-4">
        <div className="flex flex-col items-center">
          <label htmlFor={`${rowId}-init`} className="text-[9px] font-semibold uppercase tracking-widest text-faint">
            Init
          </label>
          <input
            id={`${rowId}-init`}
            inputMode="numeric"
            className="h-10 w-12 rounded-xl border border-border bg-bg/60 text-center text-lg font-semibold tabular-nums focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft"
            value={initDraft ?? (c.initiative === null ? "" : String(c.initiative))}
            placeholder="–"
            onChange={(event) => setInitDraft(event.target.value.replace(/[^0-9-]/g, "").slice(0, 3))}
            onBlur={commitInitiative}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            }}
          />
        </div>

        <button type="button" onClick={props.onSelect} className="min-w-0 flex-1 text-left" aria-describedby={`${rowId}-hp`}>
          <span className="flex items-center gap-2">
            <span className={`truncate font-display text-lg font-semibold leading-tight ${state === "down" ? "line-through decoration-danger/70" : ""}`}>{c.name}</span>
            {c.friendly && c.kind !== "player" ? <span className="shrink-0 rounded-full border border-ok/40 bg-ok/10 px-1.5 text-[10px] font-medium text-ok">Ally</span> : null}
            {c.concentration ? (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-1.5 py-px text-[10px] font-semibold text-accent" title="Concentrating">
                <Brain className="size-3" aria-hidden /> Conc.
              </span>
            ) : null}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span>{KIND_LABEL[c.kind]}</span>
            <span className="text-faint">·</span>
            <span className="tabular-nums">Init {formatModifier(c.initiativeBonus)}</span>
            {c.conditions.map((condition) => (
              <span key={condition.name} className="rounded-full border border-warn/40 bg-warn/10 px-1.5 text-[10px] font-medium text-warn" title={conditionHint(condition.name)}>
                {condition.name}
                {condition.rounds !== null ? ` ${condition.rounds}` : ""}
              </span>
            ))}
          </span>
        </button>

        <div className="hidden shrink-0 items-center gap-1 text-sm tabular-nums text-muted sm:flex" title="Armor Class">
          <Shield className="size-4" aria-hidden />
          <span className="font-semibold text-text">{c.ac}</span>
        </div>

        <div id={`${rowId}-hp`} className="w-24 shrink-0 sm:w-32">
          <div className="flex items-baseline justify-end gap-1 tabular-nums">
            <span className={`text-lg font-semibold ${state === "down" ? "text-danger" : state === "bloodied" ? "text-warn" : "text-text"}`}>{c.hp}</span>
            <span className="text-xs text-faint">/ {c.maxHp}</span>
            {c.tempHp ? <span className="text-xs font-semibold text-accent-2">+{c.tempHp}</span> : null}
          </div>
          <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${c.hp} of ${c.maxHp} hit points${c.tempHp ? `, ${c.tempHp} temporary` : ""}`}>
            <div className={`h-full ${barColor} transition-[width]`} style={{ width: `${percent}%` }} />
            {c.tempHp ? <div className="h-full bg-accent-2" style={{ width: `${tempPercent}%` }} /> : null}
          </div>
        </div>

        <Button
          size="icon"
          variant="ghost"
          className="size-9"
          icon={ChevronDown}
          aria-expanded={expanded}
          aria-controls={`${rowId}-controls`}
          aria-label={expanded ? `Hide controls for ${c.name}` : `Show controls for ${c.name}`}
          onClick={() => setExpanded((open) => !open)}
        />
      </div>

      <form
        className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          hit();
        }}
      >
        <label htmlFor={`${rowId}-amount`} className="sr-only">
          Hit points to change for {c.name}
        </label>
        <input
          id={`${rowId}-amount`}
          inputMode="numeric"
          className={`${inputBaseClass} h-9 w-20 px-2 text-center tabular-nums`}
          placeholder="0"
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        <Button type="submit" size="sm" variant="danger-ghost" icon={Minus} disabled={!value}>
          Damage
        </Button>
        <Button
          size="sm"
          icon={Plus}
          disabled={!value}
          onClick={() => {
            props.onHeal(value);
            setAmount("");
          }}
        >
          Heal
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={ShieldPlus}
          disabled={!value}
          onClick={() => {
            props.onTemp(value);
            setAmount("");
          }}
        >
          Temp
        </Button>
        {concentrationDc !== null ? (
          <span className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent-soft px-2.5 py-1 text-xs text-accent" role="status">
            <HeartPulse className="size-3.5" aria-hidden /> Concentration save DC {concentrationDc}
            <button type="button" className="font-semibold hover:underline" onClick={() => setConcentrationDc(null)}>
              OK
            </button>
          </span>
        ) : null}
        {state === "down" ? (
          <span className="ml-auto flex items-center gap-1 text-xs font-medium text-danger">
            <Heart className="size-3.5" aria-hidden /> Down
          </span>
        ) : null}
      </form>

      {expanded ? (
        <div id={`${rowId}-controls`} className="space-y-3 border-t border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor={`${rowId}-conc`} className="flex cursor-pointer items-center gap-2 text-sm">
              <input id={`${rowId}-conc`} type="checkbox" className="size-4 accent-[var(--accent)]" checked={c.concentration} onChange={(event) => props.onConcentration(event.target.checked)} />
              Concentrating
            </label>
            <div className="flex items-center gap-2 text-sm">
              <label htmlFor={`${rowId}-rounds`} className="text-muted">
                New conditions last
              </label>
              <input
                id={`${rowId}-rounds`}
                inputMode="numeric"
                className={`${inputBaseClass} h-8 w-14 px-2 text-center`}
                placeholder="∞"
                value={rounds}
                onChange={(event) => setRounds(event.target.value.replace(/\D/g, "").slice(0, 3))}
              />
              <span className="text-muted">rounds</span>
            </div>
            <Button size="sm" variant="danger-ghost" icon={Trash2} className="ml-auto" onClick={props.onRemove}>
              Remove
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Conditions for ${c.name}`}>
            {CONDITIONS.map((condition) => {
              const on = c.conditions.some((item) => item.name === condition.name);
              return (
                <button
                  key={condition.name}
                  type="button"
                  aria-pressed={on}
                  title={condition.hint}
                  onClick={() => props.onToggleCondition(condition.name, rounds ? Number.parseInt(rounds, 10) : null)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition ${
                    on ? "border-warn/50 bg-warn/15 font-medium text-warn" : "border-border bg-surface-2 text-muted hover:text-text"
                  }`}
                >
                  {condition.name}
                </button>
              );
            })}
          </div>
          {!props.combatStarted ? <p className="text-xs text-faint">Timed conditions count down at the start of this combatant&apos;s turn.</p> : null}
        </div>
      ) : null}
    </li>
  );
}
