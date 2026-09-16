"use client";

import { ArrowUpRight, Dices, History, Music2 } from "lucide-react";
import Link from "next/link";
import { formatBytes } from "@/lib/format";
import { useMusicState, useStats } from "@/lib/bot/useBotState";
import { PresenceDot } from "./LivePresence";

export function HubBotCard() {
  const stats = useStats();
  const music = useMusicState();
  const s = stats.data;

  const facts = [
    { label: "Pending transcripts", value: s ? String(s.sessions.pending_transcription) : "—" },
    { label: "Disk free", value: s ? formatBytes(s.disk.free_mb * 1024 * 1024) : "—" },
    { label: "Now playing", value: music.data?.current?.title ?? "Nothing" },
  ];

  return (
    <div className="relative h-full overflow-hidden rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-8">
      <div
        className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-gradient-to-br from-accent to-accent-2 opacity-20 blur-3xl"
        aria-hidden
      />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-accent-fg">
            <Dices className="size-7" aria-hidden />
          </span>
          <div>
            <h2 className="text-xl font-semibold">D&amp;D Recorder</h2>
            <p className="text-sm text-muted">Record sessions, follow transcription, run the table music.</p>
          </div>
        </div>
        <PresenceDot />
      </div>

      <dl className="relative mt-8 grid gap-4 sm:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.label} className="min-w-0 rounded-2xl border border-border bg-surface-2/60 p-4">
            <dt className="text-xs text-muted">{fact.label}</dt>
            <dd className="mt-1 truncate text-lg font-semibold">{fact.value}</dd>
          </div>
        ))}
      </dl>

      <div className="relative mt-6 flex flex-wrap gap-2">
        <Link
          href="/bot"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-accent-fg hover:bg-accent-strong"
        >
          Open dashboard <ArrowUpRight className="size-4" aria-hidden />
        </Link>
        <Link href="/bot/music" className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-surface-2 px-4 text-sm hover:bg-surface-3">
          <Music2 className="size-4" aria-hidden /> Music
        </Link>
        <Link href="/bot/sessions" className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-surface-2 px-4 text-sm hover:bg-surface-3">
          <History className="size-4" aria-hidden /> Sessions
        </Link>
      </div>
    </div>
  );
}
