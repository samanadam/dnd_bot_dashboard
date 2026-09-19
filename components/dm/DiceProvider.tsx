"use client";

import { Check, Dices, Send, Trash2, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useToast } from "@/components/Providers";
import { Button, inputClass } from "@/components/ui";
import { BotError, bot } from "@/lib/bot/client";
import { emptyTray, toExpression, type Tray } from "@/lib/dice/pick";
import { DiceError, naturalD20, rollDice, withAdvantage, type RollResult } from "@/lib/dice/roll";
import type { StatBlock } from "@/lib/dm/statblock";
import { DicePicker } from "./DicePicker";
import { StatBlockView } from "./StatBlockView";

// Dice for the whole DM Screen: one provider holds the history and renders the
// tray, and anything inside (stat blocks, the tracker, the dice page) rolls
// through `useDice().roll`. Rolls stay in the browser unless sent to Discord.

export type SendState = "no" | "sending" | "sent" | "failed";
export type RollEntry = RollResult & { id: string; label: string; at: number; sent: SendState; natural: 20 | 1 | null };
export type Mode = "normal" | "adv" | "dis";

type DiceApi = {
  roll: (label: string, expression: string) => RollEntry | null;
  history: RollEntry[];
  send: (id: string) => Promise<void>;
  autoSend: boolean;
  setAutoSend: (value: boolean) => void;
  clear: () => void;
  open: () => void;
};

const DiceContext = createContext<DiceApi | null>(null);
const HISTORY_KEY = "dm-dice-history";
const AUTOSEND_KEY = "dm-dice-autosend";
const MAX_HISTORY = 50;
let counter = 0;

function readStorage<T>(storage: () => Storage, key: string, fallback: T, valid: (value: unknown) => value is T): T {
  try {
    const raw = storage().getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return valid(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

const isHistory = (value: unknown): value is RollEntry[] =>
  Array.isArray(value) && value.every((entry) => entry && typeof entry === "object" && typeof (entry as RollEntry).total === "number" && typeof (entry as RollEntry).expression === "string");

export function DiceProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [history, setHistory] = useState<RollEntry[]>([]);
  const [autoSend, setAutoSendState] = useState(false);
  const [open, setOpen] = useState(false);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    // Restored after mount so server and client render the same markup.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from storage
    setHistory(readStorage(() => sessionStorage, HISTORY_KEY, [], isHistory).map((entry) => (entry.sent === "sending" ? { ...entry, sent: "failed" } : entry)));
    setAutoSendState(readStorage(() => localStorage, AUTOSEND_KEY, false, (v): v is boolean => typeof v === "boolean"));
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
    } catch {
      // Storage full or blocked: history just does not survive a reload.
    }
  }, [history, restored]);

  const setAutoSend = useCallback((value: boolean) => {
    setAutoSendState(value);
    try {
      localStorage.setItem(AUTOSEND_KEY, JSON.stringify(value));
    } catch {}
  }, []);

  const mark = useCallback((id: string, sent: SendState) => {
    setHistory((entries) => entries.map((entry) => (entry.id === id ? { ...entry, sent } : entry)));
  }, []);

  const sendEntry = useCallback(
    async (entry: RollEntry) => {
      if (entry.sent === "sending" || entry.sent === "sent") return;
      mark(entry.id, "sending");
      try {
        await bot.announceDice({
          expression: entry.expression,
          total: entry.total,
          breakdown: entry.breakdown,
          ...(entry.label ? { label: entry.label.slice(0, 80) } : {}),
        });
        mark(entry.id, "sent");
      } catch (error) {
        mark(entry.id, "failed");
        const message =
          error instanceof BotError && error.code === "no_dice_channel"
            ? "The bot has no dice channel. Set DICE_CHANNEL_ID on the bot."
            : error instanceof BotError
              ? error.message
              : "Could not send the roll to Discord.";
        toast("danger", message);
      }
    },
    [mark, toast],
  );

  const roll = useCallback(
    (label: string, expression: string) => {
      try {
        const result = rollDice(expression);
        const entry: RollEntry = { ...result, id: `r${Date.now().toString(36)}${++counter}`, label: label.slice(0, 80), at: Date.now(), sent: "no", natural: naturalD20(result) };
        setHistory((entries) => [entry, ...entries].slice(0, MAX_HISTORY));
        setOpen(true);
        if (autoSend) void sendEntry(entry);
        return entry;
      } catch (error) {
        toast("danger", error instanceof DiceError ? error.message : "Those dice could not be rolled.");
        return null;
      }
    },
    [autoSend, sendEntry, toast],
  );

  const api = useMemo<DiceApi>(
    () => ({
      roll,
      history,
      send: async (id) => {
        const entry = history.find((item) => item.id === id);
        if (entry) await sendEntry(entry);
      },
      autoSend,
      setAutoSend,
      clear: () => setHistory([]),
      open: () => setOpen(true),
    }),
    [roll, history, sendEntry, autoSend, setAutoSend],
  );

  return (
    <DiceContext.Provider value={api}>
      {children}
      <DiceTray open={open} onOpenChange={setOpen} />
    </DiceContext.Provider>
  );
}

export function useDice(): DiceApi {
  const value = useContext(DiceContext);
  if (!value) throw new Error("useDice must be used inside DiceProvider");
  return value;
}

export function RollableStatBlock({ block, compact }: { block: StatBlock; compact?: boolean }) {
  const { roll } = useDice();
  return <StatBlockView block={block} compact={compact} onRoll={(label, expression) => roll(`${block.name}: ${label}`, expression)} />;
}

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100] as const;

export function SendButton({ entry, onSend, size = "sm" }: { entry: RollEntry; onSend: () => void; size?: "sm" | "icon" }) {
  const label = entry.sent === "sent" ? "Sent" : entry.sent === "failed" ? "Retry" : "Send to Discord";
  if (size === "icon") {
    return (
      <Button
        size="icon"
        variant="ghost"
        className="size-8"
        icon={entry.sent === "sent" ? Check : Send}
        busy={entry.sent === "sending"}
        disabled={entry.sent === "sent"}
        aria-label={entry.sent === "sent" ? "Sent to Discord" : "Send to Discord"}
        title={entry.sent === "failed" ? "Sending failed, try again" : undefined}
        onClick={onSend}
      />
    );
  }
  return (
    <Button size="sm" icon={entry.sent === "sent" ? Check : Send} busy={entry.sent === "sending"} disabled={entry.sent === "sent"} onClick={onSend}>
      {label}
    </Button>
  );
}

export function ResultCard({ entry, large = false }: { entry: RollEntry; large?: boolean }) {
  const crit = entry.natural === 20;
  const fumble = entry.natural === 1;
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-4 ${
        crit ? "border-ok/40 bg-ok/10" : fumble ? "border-danger/40 bg-danger/10" : "border-border bg-surface-2"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted">{entry.label || "Roll"}</p>
          <p className="mt-0.5 font-mono text-xs text-faint">{entry.expression}</p>
        </div>
        {crit ? <span className="rounded-full bg-ok/15 px-2 py-0.5 text-[11px] font-semibold text-ok">Natural 20</span> : null}
        {fumble ? <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-semibold text-danger">Natural 1</span> : null}
      </div>
      <p key={entry.id} className={`die-settle mt-2 font-semibold tabular-nums leading-none ${large ? "text-6xl" : "text-5xl"} ${crit ? "text-ok" : fumble ? "text-danger" : "text-text"}`}>
        {entry.total}
      </p>
      <p className="mt-2 break-words font-mono text-xs text-muted">{entry.breakdown}</p>
    </div>
  );
}

export function DiceRoller({ autoFocus = false, onRolled }: { autoFocus?: boolean; onRolled?: () => void }) {
  const { roll } = useDice();
  const [expression, setExpression] = useState("1d20");
  const [mode, setMode] = useState<Mode>("normal");
  const [tray, setTray] = useState<Tray>(emptyTray);
  // Picking dice writes the expression; typing takes it back by hand.
  const pick = (next: Tray) => {
    setTray(next);
    setExpression(toExpression(next) || "1d20");
  };

  const apply = (value: string) => (mode === "normal" ? value : withAdvantage(value, mode));
  const doRoll = (value: string, label = "") => {
    const modeLabel = mode === "adv" ? "with advantage" : mode === "dis" ? "with disadvantage" : "";
    if (roll([label, value.includes("d20") ? modeLabel : ""].filter(Boolean).join(" "), apply(value))) onRolled?.();
  };

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          doRoll(expression);
        }}
      >
        <label className="sr-only" htmlFor={autoFocus ? "dice-expression-page" : "dice-expression-tray"}>
          Dice expression
        </label>
        <input
          id={autoFocus ? "dice-expression-page" : "dice-expression-tray"}
          className={`${inputClass} min-w-0 flex-1 font-mono`}
          value={expression}
          maxLength={100}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          placeholder="2d6+3"
          onChange={(event) => {
            setTray(emptyTray);
            setExpression(event.target.value);
          }}
        />
        <Button type="submit" variant="primary" icon={Dices}>
          Roll
        </Button>
      </form>
      <DicePicker tray={tray} onChange={pick} />
      <div role="radiogroup" aria-label="Advantage" className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-bg/40 p-1">
        {(
          [
            ["dis", "Disadvantage"],
            ["normal", "Normal"],
            ["adv", "Advantage"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => setMode(value)}
            className={`rounded-lg px-2 py-1.5 text-xs font-medium transition ${mode === value ? "bg-surface-3 text-text shadow-card" : "text-muted hover:text-text"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {QUICK_DICE.map((sides) => (
          <button
            key={sides}
            type="button"
            onClick={() => doRoll(`1d${sides}`)}
            className="flex aspect-square flex-col items-center justify-center rounded-xl border border-border bg-surface-2 text-xs font-semibold tabular-nums text-muted transition hover:border-accent hover:text-accent active:translate-y-px"
          >
            d{sides}
          </button>
        ))}
      </div>
    </div>
  );
}

function DiceTray({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) {
  const { history, send, autoSend, setAutoSend, clear } = useDice();
  const latest = history[0];
  const panelRef = useRef<HTMLDivElement>(null);
  // The Dice page is the full-size version of this tray.
  const onDicePage = usePathname() === "/dm/dice";

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (onDicePage && !open) return null;

  return (
    <div className="fixed right-4 z-40 bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] lg:bottom-6 lg:right-6">
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Dice"
          className="w-[22rem] max-w-[calc(100vw-2rem)] space-y-3 rounded-3xl border border-border bg-surface/95 p-4 shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Dices className="size-4 text-accent" aria-hidden /> Dice
            </span>
            <Button size="icon" variant="ghost" className="size-8" icon={X} aria-label="Close dice" onClick={() => onOpenChange(false)} />
          </div>
          {latest ? (
            <div className="space-y-2">
              <ResultCard entry={latest} />
              <SendButton entry={latest} onSend={() => void send(latest.id)} />
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
              Roll below, or click any bonus on a stat block.
            </p>
          )}
          <DiceRoller />
          {history.length > 1 ? (
            <ul className="max-h-40 space-y-0.5 overflow-y-auto border-t border-border pt-2" aria-label="Earlier rolls">
              {history.slice(1, 20).map((entry) => (
                <li key={entry.id} className="flex items-center gap-2 rounded-lg px-1.5 text-xs">
                  <span className={`w-9 text-right text-sm font-semibold tabular-nums ${entry.natural === 20 ? "text-ok" : entry.natural === 1 ? "text-danger" : "text-text"}`}>
                    {entry.total}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted" title={`${entry.expression} · ${entry.breakdown}`}>
                    {entry.label || entry.expression}
                  </span>
                  <SendButton entry={entry} size="icon" onSend={() => void send(entry.id)} />
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <label htmlFor="dice-autosend" className="flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input id="dice-autosend" type="checkbox" className="size-4 accent-[var(--accent)]" checked={autoSend} onChange={(event) => setAutoSend(event.target.checked)} />
              Send every roll to Discord
            </label>
            {history.length ? (
              <Button size="sm" variant="ghost" icon={Trash2} onClick={clear}>
                Clear
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          aria-label={latest ? `Open dice, last roll ${latest.total}` : "Open dice"}
          className="flex h-14 min-w-14 items-center justify-center gap-2 rounded-full bg-accent px-4 text-accent-fg shadow-[0_12px_32px_-10px_var(--accent)] transition hover:bg-accent-strong active:translate-y-px"
        >
          <Dices className="size-6" aria-hidden />
          {latest ? <span className="text-lg font-semibold tabular-nums">{latest.total}</span> : null}
        </button>
      )}
    </div>
  );
}
