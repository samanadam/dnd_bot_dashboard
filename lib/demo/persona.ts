"use client";

import { fromSummary, type Access, type AccessSummary } from "@/lib/access/permissions";
import { useLocalValue } from "@/lib/useLocalValue";
import { CAMPAIGN_EMBER, DEMO_USER } from "./fixtures";

// Who the demo visitor is pretending to be. The same pages render with the
// access each one would have in the real portal, so the difference between the
// owner, a co-DM and a player can be seen without signing in.

export const PERSONAS = {
  owner: { label: "Owner", description: "Everything, everywhere." },
  codm: { label: "Co-DM", description: "The DM tools and the bot overview, in Embers of Hollowmere only." },
  player: { label: "Player", description: "Their own characters and the battle page, in Embers of Hollowmere." },
} as const;
export type Persona = keyof typeof PERSONAS;

const ALL: AccessSummary["permissions"] = {
  "bot.view": "all",
  "bot.recording": "all",
  "bot.music": "all",
  "bot.sessions": "all",
  "bot.manage": "all",
  play: "all",
  "sheets.manage": "all",
  dm: "all",
};

export const PERSONA_ACCESS: Record<Persona, AccessSummary> = {
  owner: { owner: true, permissions: ALL },
  codm: { owner: false, permissions: { "bot.view": "all", dm: [CAMPAIGN_EMBER], "sheets.manage": [CAMPAIGN_EMBER] } },
  player: { owner: false, permissions: { play: [CAMPAIGN_EMBER] } },
};

const KEY = "viewAs";
export const parsePersona = (value: string | null | undefined): Persona => (value === "codm" || value === "player" ? value : "owner");

/** The persona outside React (the demo transports). */
export function currentPersona(): Persona {
  // Same lookup as useLocalValue: sessionStorage first, then localStorage; either may be blocked.
  for (const storage of ["sessionStorage", "localStorage"] as const) {
    try {
      const value = window[storage]?.getItem(`demo.portal.${KEY}`);
      if (value !== null && value !== undefined) return parsePersona(value);
    } catch {
      // Blocked storage: try the next one.
    }
  }
  return "owner";
}

export function personaAccess(persona: Persona = currentPersona()): Access {
  return fromSummary(DEMO_USER.id, PERSONA_ACCESS[persona]);
}

export function useDemoPersona(): [Persona, (next: Persona) => void] {
  const [raw, setRaw] = useLocalValue(`portal.${KEY}`);
  return [parsePersona(raw), (next) => setRaw(next === "owner" ? "" : next)];
}
