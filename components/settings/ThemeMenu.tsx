"use client";

import { Check, Moon, Palette, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { applyTheme } from "@/lib/applyTheme";
import { parseTheme, THEMES, type ThemeId } from "@/lib/theme";

/**
 * Compact theme switcher for pages with no settings page behind them (sign-in).
 * Applies the theme at once, then refreshes so server-rendered artwork follows.
 */
export function ThemeMenu({ initial }: { initial: ThemeId }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<ThemeId>(initial);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (id: ThemeId) => {
    setCurrent(id);
    applyTheme(parseTheme(id));
    router.refresh();
  };

  return (
    <div ref={ref} className="absolute right-4 top-4 z-30 sm:right-6 sm:top-6">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Change theme"
        title="Change theme"
        onClick={() => setOpen((value) => !value)}
        className="grid size-10 place-items-center rounded-full border border-border bg-surface/80 text-muted shadow-card backdrop-blur-xl transition hover:border-border-strong hover:text-accent"
      >
        <Palette className="size-[18px]" aria-hidden />
      </button>

      {open && (
        <div role="radiogroup" aria-label="Theme" className="absolute right-0 mt-2 w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface/95 p-2 shadow-card backdrop-blur-xl">
          <div className="max-h-[min(34rem,80dvh)] overflow-y-auto">
            <div className="grid grid-cols-2 gap-1.5">
              {THEMES.map((theme) => {
                const t = theme.tokens;
                const selected = theme.id === current;
                const SchemeIcon = t.scheme === "light" ? Sun : Moon;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => choose(theme.id)}
                    className={`rounded-xl border p-1.5 text-left transition ${selected ? "border-accent ring-2 ring-accent-soft" : "border-transparent hover:border-border-strong hover:bg-surface-2"}`}
                  >
                    <span className="relative block h-12 overflow-hidden rounded-lg border" style={{ background: t.bg, borderColor: t.border }} aria-hidden>
                      <span className="absolute -right-3 -top-4 size-12 rounded-full opacity-40 blur-xl" style={{ background: t.glow1 }} />
                      <span className="absolute bottom-1.5 left-1.5 flex gap-1">
                        <span className="size-3 rounded-full" style={{ background: t.accent }} />
                        <span className="size-3 rounded-full" style={{ background: t.accent2 }} />
                        <span className="size-3 rounded-full border" style={{ background: t.surface2, borderColor: t.border }} />
                      </span>
                    </span>
                    <span className="mt-1.5 flex items-center gap-1.5 px-0.5 text-xs font-medium">
                      <span className="min-w-0 flex-1 truncate">{theme.label}</span>
                      {selected ? <Check className="size-3.5 text-accent" aria-hidden /> : <SchemeIcon className="size-3 text-muted" aria-hidden />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
