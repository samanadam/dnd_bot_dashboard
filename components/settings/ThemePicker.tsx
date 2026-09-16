"use client";

import { Check, ChevronDown, ChevronUp, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { parseTheme, THEME_COOKIE, THEMES, themeVars, type Theme, type ThemeId } from "@/lib/theme";

const INITIAL_VISIBLE = 6;

function applyTheme(id: ThemeId) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(themeVars(id))) {
    if (key === "colorScheme") root.style.colorScheme = value;
    else root.style.setProperty(key, value);
  }
  root.dataset.theme = id;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  // Plain preference cookie, not sensitive. The server re-validates the id.
  document.cookie = `${THEME_COOKIE}=${id}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

export function ThemePicker({ initial }: { initial: ThemeId }) {
  const [current, setCurrent] = useState<ThemeId>(() =>
    typeof document === "undefined" ? initial : parseTheme(document.documentElement.dataset.theme),
  );
  const [showAll, setShowAll] = useState(false);

  // The selected theme always stays visible, even when it is past the fold.
  const selectedIndex = THEMES.findIndex((theme) => theme.id === current);
  const visible = showAll
    ? THEMES
    : selectedIndex >= INITIAL_VISIBLE
      ? [...THEMES.slice(0, INITIAL_VISIBLE - 1), THEMES[selectedIndex]]
      : THEMES.slice(0, INITIAL_VISIBLE);
  const hidden = THEMES.length - INITIAL_VISIBLE;

  return (
    <div>
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-3">
        {visible.map((theme) => (
          <ThemeCard
            key={theme.id}
            theme={theme}
            active={theme.id === current}
            onSelect={() => {
              setCurrent(theme.id);
              applyTheme(theme.id);
            }}
          />
        ))}
      </div>
      {hidden > 0 && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            aria-expanded={showAll}
            onClick={() => setShowAll((value) => !value)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface-2 px-4 text-sm font-medium text-text transition hover:border-border-strong hover:bg-surface-3"
          >
            {showAll ? (
              <>
                Show fewer <ChevronUp className="size-4" aria-hidden />
              </>
            ) : (
              <>
                Show all {THEMES.length} themes <ChevronDown className="size-4" aria-hidden />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

/** A miniature of the dashboard painted in the theme's own colours. */
function ThemeCard({ theme, active, onSelect }: { theme: Theme; active: boolean; onSelect: () => void }) {
  const t = theme.tokens;
  const SchemeIcon = t.scheme === "light" ? Sun : Moon;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={`group rounded-2xl border p-2 text-left transition ${
        active ? "border-accent ring-4 ring-accent-soft" : "border-border hover:border-border-strong"
      }`}
    >
      <div className="relative overflow-hidden rounded-xl border" style={{ background: t.bg, borderColor: t.border }} aria-hidden>
        <div className="absolute -right-6 -top-8 size-24 rounded-full opacity-30 blur-2xl" style={{ background: t.glow1 }} />
        <div className="relative flex h-20 gap-1.5 p-2 sm:h-28 sm:gap-2 sm:p-2.5">
          {/* sidebar */}
          <div className="hidden w-10 flex-col gap-1.5 rounded-md p-1.5 sm:flex" style={{ background: t.surface }}>
            <div className="size-3.5 rounded" style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})` }} />
            <div className="h-1.5 rounded-full" style={{ background: t.accent, opacity: 0.8 }} />
            <div className="h-1.5 rounded-full" style={{ background: t.surface3 }} />
            <div className="h-1.5 rounded-full" style={{ background: t.surface3 }} />
          </div>
          {/* content */}
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-2 w-2/3 rounded-full" style={{ background: t.text, opacity: 0.85 }} />
            <div className="flex flex-1 gap-1.5">
              <div className="flex flex-1 flex-col justify-between rounded-md border p-1.5" style={{ background: t.surface, borderColor: t.border }}>
                <div className="h-1.5 w-1/2 rounded-full" style={{ background: t.muted }} />
                <div className="flex items-end gap-0.5">
                  {[40, 70, 55, 90, 65].map((h) => (
                    <div key={h} className="flex-1 rounded-t-sm" style={{ height: `${h * 0.28}px`, background: t.accent }} />
                  ))}
                </div>
              </div>
              <div className="flex w-1/3 flex-col gap-1 rounded-md border p-1.5" style={{ background: t.surface, borderColor: t.border }}>
                <div className="size-1.5 rounded-full" style={{ background: t.ok }} />
                <div className="h-1.5 rounded-full" style={{ background: t.surface3 }} />
                <div className="mt-auto h-3 rounded" style={{ background: t.accent }} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 px-1.5 pb-1 pt-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            {theme.label}
            <SchemeIcon className="size-3 text-muted" aria-label={t.scheme === "light" ? "Light theme" : "Dark theme"} />
          </div>
          <div className="hidden truncate text-xs text-muted sm:block">{theme.description}</div>
        </div>
        <span
          className={`grid size-5 shrink-0 place-items-center rounded-full border transition ${
            active ? "border-accent bg-accent text-accent-fg" : "border-border-strong"
          }`}
        >
          {active && <Check className="size-3" aria-hidden />}
        </span>
      </div>
    </button>
  );
}
