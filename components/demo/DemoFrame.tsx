"use client";

import { FlaskConical, LogIn, RotateCcw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PortalLink } from "@/components/PortalLink";
import { PersonaSwitch } from "./DemoShell";
import { DEMO_TEXT_CHANNEL, DEMO_VOICE_CHANNEL } from "@/lib/demo/fixtures";
import type { DemoState } from "@/lib/demo/fixtures";
import { useDemoState } from "@/lib/demo/store";

// Pieces every demo page shares: the notice at the top, the sign-in link in
// place of sign-out, and the loading and not-found states of pages that read
// the in-browser store (it only exists after hydration).

// Fake channel ids so recording and music work straight away. Only the demo's
// own keys (demo.*) are touched, never the real portal's.
if (typeof window !== "undefined") {
  try {
    const seed = { "demo.portal.bot.voiceChannelId": DEMO_VOICE_CHANNEL, "demo.portal.bot.textChannelId": DEMO_TEXT_CHANNEL };
    for (const [key, value] of Object.entries(seed)) if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the visitor types a channel id, as in the portal.
  }
}

export function DemoBanner() {
  return (
    <div role="note" className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm">
      <FlaskConical className="size-4 shrink-0 text-accent" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Demo.</span> Everything here is made up and lives only in this browser tab. Try anything: nothing reaches Discord, the bot or the
        real portal, and a reload starts over.
      </p>
      <PersonaSwitch />
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 text-xs font-medium hover:bg-surface-3"
      >
        <RotateCcw className="size-3.5" aria-hidden /> Start over
      </button>
    </div>
  );
}

export function DemoSignIn() {
  // A plain link: /signin is the real portal, not a demo page.
  return (
    <Link href="/signin" aria-label="Sign in to the real portal" title="Sign in" className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-3 hover:text-accent">
      <LogIn className="size-4" aria-hidden />
    </Link>
  );
}

export function DemoLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-10 w-64 animate-pulse rounded-xl bg-surface-2" />
      <div className="h-48 animate-pulse rounded-3xl bg-surface-2" />
    </div>
  );
}

export function DemoMissing({ what, back }: { what: string; back: { href: string; label: string } }) {
  return (
    <div className="mx-auto max-w-md rounded-3xl border border-border bg-surface p-8 text-center shadow-card">
      <h1 className="font-display text-xl font-semibold">No such {what}</h1>
      <p className="mt-1 text-sm text-muted">It may have been deleted in this demo, or it never existed.</p>
      <PortalLink href={back.href} className="mt-4 inline-block text-sm font-medium text-accent hover:underline">
        {back.label}
      </PortalLink>
    </div>
  );
}

/** Renders once the demo store exists in the browser; a placeholder before that. */
export function WithDemo({ children }: { children: (state: DemoState) => ReactNode }) {
  const state = useDemoState();
  return state ? <>{children(state)}</> : <DemoLoading />;
}
