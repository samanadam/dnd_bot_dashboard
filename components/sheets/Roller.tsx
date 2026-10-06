"use client";

import { Dices, Send } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useToast } from "@/components/Providers";
import { DmError } from "@/lib/dm/client";
import { sheets, type RollAnswer } from "@/lib/sheets/client";
import { useLocalValue } from "@/lib/useLocalValue";

type Mode = "normal" | "advantage" | "disadvantage";
type Roller = { roll: (expression: string, label: string) => Promise<RollAnswer | null>; mode: Mode };

const RollContext = createContext<Roller>({ roll: async () => null, mode: "normal" });
export const useRoller = () => useContext(RollContext);

/**
 * Every roll on a sheet goes to the server, which rolls it (and posts it to the
 * Discord dice channel when the player wants). The log lives in this tab only.
 */
export function RollProvider({ sheetId, children }: { sheetId: string; children: ReactNode }) {
  const toast = useToast();
  const [log, setLog] = useState<RollAnswer[]>([]);
  const [mode, setMode] = useState<Mode>("normal");
  const [post, setPost] = useLocalValue("portal.sheet.postRolls");
  const announce = post !== "off";

  const roll = useCallback(
    async (expression: string, label: string) => {
      try {
        // Advantage applies to d20 rolls only; damage and healing roll as written.
        const d20 = /^1?d20\b/i.test(expression.replace(/\s/g, ""));
        const answer = await sheets.roll(sheetId, { expression, label, mode: d20 ? mode : "normal", announce });
        setLog((current) => [answer, ...current].slice(0, 30));
        if (d20) setMode("normal");
        return answer;
      } catch (error) {
        toast("danger", error instanceof DmError ? error.message : "Could not roll.");
        return null;
      }
    },
    [announce, mode, sheetId, toast],
  );

  const value = useMemo(() => ({ roll, mode }), [roll, mode]);

  return (
    <RollContext.Provider value={value}>
      {children}
      <div className="sticky bottom-3 z-20 mt-6 space-y-2 rounded-3xl border border-border bg-surface/95 p-3 shadow-card backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <Dices className="size-4 text-muted" aria-hidden />
          <div role="radiogroup" aria-label="Next d20 roll" className="flex gap-1 rounded-xl border border-border bg-bg/40 p-1">
            {(["disadvantage", "normal", "advantage"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={mode === option}
                onClick={() => setMode(option)}
                className={`rounded-lg px-2 py-1 text-xs font-medium ${mode === option ? "bg-surface-3 text-text" : "text-muted"}`}
              >
                {option === "normal" ? "Normal" : option === "advantage" ? "Advantage" : "Disadvantage"}
              </button>
            ))}
          </div>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" className="accent-[var(--accent)]" checked={announce} onChange={(event) => setPost(event.target.checked ? "on" : "off")} />
            <Send className="size-3" aria-hidden /> Post to Discord
          </label>
        </div>
        {log.length ? (
          <ol className="max-h-32 space-y-1 overflow-y-auto text-sm" aria-live="polite">
            {log.map((entry, index) => (
              <li key={index} className={`flex items-baseline gap-2 ${index === 0 ? "" : "text-muted"}`}>
                <span className="font-semibold tabular-nums">{entry.total}</span>
                <span className="truncate">{entry.label}</span>
                <span className="ml-auto truncate font-mono text-xs text-faint">{entry.breakdown}</span>
                {entry.natural === 20 ? <span className="text-xs font-semibold text-ok">nat 20</span> : entry.natural === 1 ? <span className="text-xs font-semibold text-danger">nat 1</span> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-faint">Tap any bonus on the sheet to roll it.</p>
        )}
      </div>
    </RollContext.Provider>
  );
}

/** A bonus that rolls d20 + bonus when tapped. */
export function RollButton({ bonus, label, className = "", children }: { bonus: number; label: string; className?: string; children?: ReactNode }) {
  const { roll } = useRoller();
  return (
    <button
      type="button"
      onClick={() => void roll(`1d20${bonus >= 0 ? `+${bonus}` : bonus}`, label)}
      className={`rounded-lg px-1.5 font-semibold tabular-nums transition hover:bg-accent-soft hover:text-accent ${className}`}
      aria-label={`Roll ${label}`}
    >
      {children ?? (bonus >= 0 ? `+${bonus}` : bonus)}
    </button>
  );
}
