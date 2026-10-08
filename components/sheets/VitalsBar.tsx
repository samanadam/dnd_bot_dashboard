"use client";

import { Brain, Heart, HeartPulse, Shield, Skull, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Badge, Button, inputBaseClass } from "@/components/ui";
import { CONDITIONS } from "@/lib/sheets/rules";
import type { SheetHandle } from "./useSheet";

/** HP and everything else that changes from turn to turn, at the top of the sheet. */
export function VitalsBar({ sheet }: { sheet: SheetHandle }) {
  const { vitals, derived, apply } = sheet;
  const [amount, setAmount] = useState("");
  const [condition, setCondition] = useState("");
  const value = Math.max(0, Math.min(10_000, Math.trunc(Number(amount)) || 0));
  const down = vitals.hp === 0;
  const dead = vitals.deathSaves.failures >= 3;
  const pct = Math.max(0, Math.min(100, (vitals.hp / derived.maxHp) * 100));

  return (
    <div className="space-y-3 rounded-3xl border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-40 flex-1">
          <div className="flex items-baseline gap-2">
            <Heart className="size-4 self-center text-danger" aria-hidden />
            <span className="text-3xl font-semibold tabular-nums">{vitals.hp}</span>
            <span className="text-muted">/ {derived.maxHp}</span>
            {vitals.tempHp ? <Badge tone="accent">+{vitals.tempHp} temp</Badge> : null}
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <div className={`h-full rounded-full ${pct > 66 ? "bg-ok" : pct > 33 ? "bg-warn" : "bg-danger"}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="hp-amount" className="sr-only">
            Amount
          </label>
          <input
            id="hp-amount"
            inputMode="numeric"
            className={`${inputBaseClass} h-10 w-20 text-center`}
            value={amount}
            placeholder="0"
            onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, "").slice(0, 5))}
          />
          <Button variant="danger" size="sm" disabled={!value} onClick={() => void apply([{ op: "damage", amount: value }]).then(() => setAmount(""))}>
            Damage
          </Button>
          <Button size="sm" disabled={!value || dead} onClick={() => void apply([{ op: "heal", amount: value }]).then(() => setAmount(""))}>
            Heal
          </Button>
          <Button size="sm" variant="ghost" disabled={!value} onClick={() => void apply([{ op: "setTemp", tempHp: value, mode: "max" }]).then(() => setAmount(""))}>
            Temp
          </Button>
        </div>
      </div>

      {down ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger/30 bg-danger/5 p-3">
          {dead ? <Skull className="size-5 text-danger" aria-hidden /> : <HeartPulse className="size-5 text-danger" aria-hidden />}
          <span className="text-sm font-medium">{dead ? "Dead" : vitals.stable ? "Stable at 0 HP" : "Dying"}</span>
          <span className="text-sm text-muted">
            Saves {vitals.deathSaves.successes}/3 · Failures {vitals.deathSaves.failures}/3
          </span>
          {!dead && !vitals.stable ? (
            <div className="ml-auto flex flex-wrap gap-1.5">
              <Button size="sm" onClick={() => void apply([{ op: "deathSave", result: "success" }])}>
                Success
              </Button>
              <Button size="sm" onClick={() => void apply([{ op: "deathSave", result: "failure" }])}>
                Failure
              </Button>
              <Button size="sm" onClick={() => void apply([{ op: "deathSave", result: "crit" }])}>
                Natural 20
              </Button>
              <Button size="sm" onClick={() => void apply([{ op: "deathSave", result: "fumble" }])}>
                Natural 1
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Badge>
          <Shield className="size-3" aria-hidden /> AC {derived.ac.value}
        </Badge>
        {vitals.concentration ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-xs text-accent">
            <Brain className="size-3" aria-hidden /> {vitals.concentration.name}
            <button type="button" aria-label="End concentration" onClick={() => void apply([{ op: "dropConcentration" }])}>
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ) : null}
        {vitals.conditions.map((c) => (
          <span key={c.name} className="inline-flex items-center gap-1 rounded-full border border-warn/30 bg-warn/10 px-2 py-0.5 text-xs text-warn">
            {c.name}
            {c.rounds ? ` · ${c.rounds} rd` : ""}
            <button type="button" aria-label={`Remove ${c.name}`} onClick={() => void apply([{ op: "removeCondition", name: c.name }])}>
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <select
          aria-label="Add a condition"
          className={`${inputBaseClass} h-8 text-xs`}
          value={condition}
          onChange={(event) => {
            const name = event.target.value;
            setCondition("");
            if (name) void apply([{ op: "addCondition", name, rounds: null }]);
          }}
        >
          <option value="">+ Condition</option>
          {CONDITIONS.filter((name) => !vitals.conditions.some((c) => c.name === name)).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <span className="inline-flex items-center gap-1 text-xs text-muted">
          Exhaustion {vitals.exhaustion}
          <button type="button" className="grid size-8 place-items-center rounded-lg hover:bg-surface-3 disabled:opacity-40 sm:size-6" aria-label="Less exhaustion" onClick={() => void apply([{ op: "exhaustion", delta: -1 }])} disabled={vitals.exhaustion === 0}>
            −
          </button>
          <button type="button" className="grid size-8 place-items-center rounded-lg hover:bg-surface-3 disabled:opacity-40 sm:size-6" aria-label="More exhaustion" onClick={() => void apply([{ op: "exhaustion", delta: 1 }])} disabled={vitals.exhaustion === 6}>
            +
          </button>
        </span>
        <button
          type="button"
          onClick={() => void apply([{ op: "inspiration", value: !vitals.inspiration }])}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${vitals.inspiration ? "border-ok/30 bg-ok/10 text-ok" : "border-border text-muted"}`}
          aria-pressed={vitals.inspiration}
        >
          <Sparkles className="size-3" aria-hidden /> Inspiration
        </button>
      </div>
    </div>
  );
}
