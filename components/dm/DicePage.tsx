"use client";

import { Dices, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { DiceRoller, ResultCard, SendButton, useDice } from "./DiceProvider";

const PRESETS = [
  { label: "Ability scores", expression: "4d6dl1", note: "Roll six times" },
  { label: "Fireball", expression: "8d6", note: "DC 15 Dex save" },
  { label: "Healing potion", expression: "2d4+2", note: "" },
  { label: "Percentile", expression: "1d100", note: "Wild magic, loot tables" },
  { label: "Death save", expression: "1d20", note: "10 or higher succeeds" },
  { label: "Sneak attack (5th)", expression: "3d6", note: "" },
];

function time(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function DicePage() {
  const { history, send, autoSend, setAutoSend, clear, roll } = useDice();
  const latest = history[0];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <section className="rounded-3xl border border-border bg-surface p-5 shadow-card">
          <DiceRoller autoFocus />
          <p className="mt-3 text-xs text-muted">
            Write dice like <code className="font-mono text-text">2d6+3</code>, keep the best with <code className="font-mono text-text">2d20kh1</code>, drop the lowest with{" "}
            <code className="font-mono text-text">4d6dl1</code>.
          </p>
        </section>
        <section className="rounded-3xl border border-border bg-surface p-5 shadow-card">
          <h2 className="font-display text-lg font-semibold">Quick rolls</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => roll(preset.label, preset.expression)}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-2 px-3.5 py-2.5 text-left transition hover:border-accent/50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{preset.label}</span>
                  {preset.note ? <span className="block truncate text-xs text-muted">{preset.note}</span> : null}
                </span>
                <span className="shrink-0 font-mono text-xs text-accent">{preset.expression}</span>
              </button>
            ))}
          </div>
        </section>
        <label htmlFor="dice-page-autosend" className="flex cursor-pointer items-center justify-between gap-3 rounded-3xl border border-border bg-surface p-5 shadow-card">
          <span>
            <span className="block text-sm font-medium">Send every roll to Discord</span>
            <span className="block text-xs text-muted">Posted by the bot in its dice channel, with mentions disabled.</span>
          </span>
          <input id="dice-page-autosend" type="checkbox" className="size-5 accent-[var(--accent)]" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} />
        </label>
      </div>

      <div className="space-y-4">
        {latest ? (
          <div className="space-y-2">
            <ResultCard entry={latest} large />
            <SendButton entry={latest} onSend={() => void send(latest.id)} />
          </div>
        ) : (
          <div className="grid place-items-center gap-2 rounded-3xl border border-dashed border-border px-6 py-16 text-center">
            <Dices className="size-8 text-faint" aria-hidden />
            <p className="text-sm text-muted">Your rolls appear here.</p>
          </div>
        )}
        {history.length > 1 ? (
          <section className="rounded-3xl border border-border bg-surface shadow-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold">History</h2>
              <Button size="sm" variant="ghost" icon={Trash2} onClick={clear}>
                Clear
              </Button>
            </div>
            <ol className="divide-y divide-border">
              {history.slice(1).map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className={`w-12 text-right text-xl font-semibold tabular-nums ${entry.natural === 20 ? "text-ok" : entry.natural === 1 ? "text-danger" : ""}`}>{entry.total}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{entry.label || entry.expression}</span>
                    <span className="block truncate font-mono text-[11px] text-faint">
                      {entry.expression} · {entry.breakdown}
                    </span>
                  </span>
                  <span className="hidden text-xs text-faint sm:block">{time(entry.at)}</span>
                  <SendButton entry={entry} size="icon" onSend={() => void send(entry.id)} />
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </div>
  );
}
