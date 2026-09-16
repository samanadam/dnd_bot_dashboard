"use client";

import { Headphones, Mic, PlugZap, Power, Radio } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { bot } from "@/lib/bot/client";
import { useActiveRecordings, useBotPresence, useHealth, useRecordingMutation, type Presence } from "@/lib/bot/useBotState";
import { formatDuration, formatUptime } from "@/lib/format";
import { useToast } from "../Providers";
import { Button } from "../ui";

const LOOK: Record<Presence["kind"], { dot: string; text: string; glow: string; pulse: boolean; label: string }> = {
  loading: { dot: "bg-faint", text: "text-muted", glow: "var(--surface-3)", pulse: false, label: "Checking" },
  offline: { dot: "bg-danger", text: "text-danger", glow: "var(--danger)", pulse: false, label: "Offline" },
  starting: { dot: "bg-warn", text: "text-warn", glow: "var(--warn)", pulse: true, label: "Starting" },
  idle: { dot: "bg-faint", text: "text-muted", glow: "var(--accent)", pulse: false, label: "Idle" },
  in_voice: { dot: "bg-ok", text: "text-ok", glow: "var(--ok)", pulse: true, label: "Active" },
  recording: { dot: "bg-danger", text: "text-danger", glow: "var(--danger)", pulse: true, label: "Recording" },
};

function Dot({ kind, size = "size-2.5" }: { kind: Presence["kind"]; size?: string }) {
  const look = LOOK[kind];
  return (
    <span className={`relative flex ${size} shrink-0`} aria-hidden>
      {look.pulse && <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 ${look.dot}`} />}
      <span className={`relative inline-flex size-full rounded-full ${look.dot}`} />
    </span>
  );
}

// Ticks between polls so a live clock does not jump.
function useTicking(base: number | undefined, updatedAt: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (base === undefined) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [base]);
  if (base === undefined) return undefined;
  return base + Math.max(0, (now - updatedAt) / 1000);
}

/**
 * The bot's live state, driven only by what the bot reports. It turns active by
 * itself when the bot joins a voice channel or starts recording, whether that
 * happened here or from a slash command in Discord.
 */
export function LivePresence() {
  const presence = useBotPresence();
  const health = useHealth();
  const recordings = useActiveRecordings();
  const toast = useToast();
  const start = useRecordingMutation(bot.startRecording);
  const look = LOOK[presence.kind];
  const first = recordings.data?.[0];
  const elapsed = useTicking(presence.kind === "recording" ? first?.elapsed_seconds : undefined, recordings.dataUpdatedAt);

  let Icon = Power;
  let title = "Checking the bot…";
  let detail: React.ReactNode = "Connecting to the bot API.";
  let action: React.ReactNode = null;

  switch (presence.kind) {
    case "offline":
      Icon = PlugZap;
      title = "Bot is offline";
      detail = "Controls unlock by themselves as soon as it answers again.";
      break;
    case "starting":
      Icon = Power;
      title = "Bot is starting";
      detail = "It is up but not connected to Discord yet.";
      break;
    case "idle":
      Icon = Radio;
      title = "Waiting in the wings";
      detail = "Not in a voice channel. Use /join or /record in Discord, or start a recording here. This page follows along.";
      break;
    case "in_voice":
      Icon = Headphones;
      title = presence.playing ? "In voice, music playing" : "In a voice channel";
      detail = (
        <>
          Channel <span className="font-mono text-text">{presence.channelId}</span>
        </>
      );
      action = (
        <Button
          variant="primary"
          size="lg"
          icon={Mic}
          busy={start.isPending}
          onClick={() =>
            start.mutate({ channel_id: presence.channelId }, { onSuccess: (session) => toast("ok", `Recording in #${session.channel_name}.`) })
          }
        >
          Record this channel
        </Button>
      );
      break;
    case "recording":
      Icon = Mic;
      title = `Recording in #${presence.channelName}`;
      detail = (
        <>
          {first ? `${first.name ?? "Untitled session"} · ${first.speaker_count} speaker${first.speaker_count === 1 ? "" : "s"}` : ""}
          {presence.count > 1 ? ` · ${presence.count} recordings live` : ""}
        </>
      );
      action = (
        <div className="flex items-center gap-4">
          <span className="font-mono text-3xl font-semibold tabular-nums sm:text-4xl">{formatDuration(elapsed)}</span>
          <Link href="#recording-now" className="text-sm font-medium text-accent hover:underline">
            Controls
          </Link>
        </div>
      );
      break;
  }

  return (
    <section
      aria-live="polite"
      aria-label="Bot status"
      className="relative overflow-hidden rounded-3xl border border-border bg-surface p-5 shadow-card sm:p-7"
    >
      <div
        className="pointer-events-none absolute -right-24 -top-32 size-80 rounded-full opacity-25 blur-3xl transition-colors duration-700"
        style={{ background: look.glow }}
        aria-hidden
      />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-4 sm:items-center sm:gap-5">
        <span className={`grid size-12 shrink-0 place-items-center rounded-2xl border border-border bg-surface-2 sm:size-14 ${look.text}`}>
          <Icon className="size-6 sm:size-7" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <Dot kind={presence.kind} size="size-2" />
            <span className={`text-xs font-semibold uppercase tracking-wider ${look.text}`}>{look.label}</span>
            {health.data && presence.kind !== "offline" && (
              <span className="text-xs text-faint">· up {formatUptime(health.data.uptime_seconds)}</span>
            )}
          </div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
          <p className="mt-1 break-words text-sm text-muted">{detail}</p>
        </div>
        </div>
        {action && <div className="flex w-full shrink-0 sm:w-auto [&>button]:w-full sm:[&>button]:w-auto">{action}</div>}
      </div>
    </section>
  );
}

/** Compact status for navigation and cards. */
export function PresenceDot({ withLabel = true }: { withLabel?: boolean }) {
  const presence = useBotPresence();
  const look = LOOK[presence.kind];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${look.text}`} title={`Bot: ${look.label}`}>
      <Dot kind={presence.kind} size="size-2" />
      {withLabel ? look.label : <span className="sr-only">Bot: {look.label}</span>}
    </span>
  );
}

