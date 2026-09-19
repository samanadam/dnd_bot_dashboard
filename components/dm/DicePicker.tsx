"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import { addBonus, addDie, DIE_SIDES, isEmpty, MAX_BONUS, MAX_PER_DIE, removeDie, emptyTray, type Tray } from "@/lib/dice/pick";

/**
 * Tap dice and a bonus instead of typing. It only fills in the expression above;
 * Roll then works exactly as it does for typed dice.
 */
export function DicePicker({ tray, onChange }: { tray: Tray; onChange: (next: Tray) => void }) {
  return (
    <div className="space-y-2" aria-label="Dice picker" role="group">
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {DIE_SIDES.map((sides) => {
          const count = tray.dice[sides] ?? 0;
          return (
            <div key={sides} className="relative">
              <button
                type="button"
                onClick={() => onChange(addDie(tray, sides))}
                disabled={count >= MAX_PER_DIE}
                aria-label={`Add a d${sides}${count ? `, ${count} chosen` : ""}`}
                className={`flex h-12 w-full items-center justify-center rounded-xl border font-mono text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 ${
                  count ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface-2 hover:border-border-strong hover:bg-surface-3"
                }`}
              >
                d{sides}
              </button>
              {count ? (
                <>
                  <span className="pointer-events-none absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold tabular-nums text-accent-fg">{count}</span>
                  <button
                    type="button"
                    aria-label={`Remove a d${sides}`}
                    onClick={() => onChange(removeDie(tray, sides))}
                    className="absolute -bottom-1.5 left-1/2 grid size-5 -translate-x-1/2 place-items-center rounded-full border border-border bg-surface text-muted transition hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <Minus className="size-3" aria-hidden />
                  </button>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1.5">
        <span className="text-xs text-muted">Bonus</span>
        <div className="flex items-center rounded-xl border border-border bg-bg/60" role="group" aria-label="Bonus">
          <button
            type="button"
            aria-label="Bonus one lower"
            disabled={tray.bonus <= -MAX_BONUS}
            onClick={() => onChange(addBonus(tray, -1))}
            className="grid size-9 place-items-center rounded-l-xl text-muted transition hover:bg-surface-2 hover:text-text disabled:opacity-40"
          >
            <Minus className="size-4" aria-hidden />
          </button>
          <span className="w-10 text-center font-mono text-sm font-semibold tabular-nums" aria-live="polite">
            {tray.bonus > 0 ? `+${tray.bonus}` : tray.bonus}
          </span>
          <button
            type="button"
            aria-label="Bonus one higher"
            disabled={tray.bonus >= MAX_BONUS}
            onClick={() => onChange(addBonus(tray, 1))}
            className="grid size-9 place-items-center rounded-r-xl text-muted transition hover:bg-surface-2 hover:text-text disabled:opacity-40"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
        {!isEmpty(tray) || tray.bonus !== 0 ? (
          <button
            type="button"
            onClick={() => onChange(emptyTray)}
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted transition hover:text-text"
          >
            <RotateCcw className="size-3" aria-hidden /> Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
