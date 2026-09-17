"use client";

import { AudioLines, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Soundboard } from "./Soundboard";

// Collapsed by default under the combat tracker. The soundboard only mounts,
// and so only polls the bot, while it is open.
export function SoundboardDrawer() {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-3xl border border-border bg-surface shadow-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="combat-soundboard"
        className="flex w-full items-center gap-3 rounded-3xl px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <AudioLines className="size-5 text-accent" aria-hidden />
        <span className="font-display text-lg font-semibold">Soundboard</span>
        <span className="hidden text-sm text-muted sm:inline">Ambience and effects in voice</span>
        <ChevronDown className={`ml-auto size-4 text-muted transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div id="combat-soundboard" className="border-t border-border p-4 sm:p-5">
          <Soundboard compact />
        </div>
      )}
    </section>
  );
}
