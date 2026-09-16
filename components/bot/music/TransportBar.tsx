"use client";

import { Headphones, LogIn, LogOut, Music2, Pause, Play, Repeat, Repeat1, SkipForward, Square, Volume1, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { bot } from "@/lib/bot/client";
import type { LoopMode, PlayerState } from "@/lib/bot/types";
import { formatDuration } from "@/lib/format";
import { keys, useMusicMutation } from "@/lib/bot/useBotState";
import { useLocalValue } from "@/lib/useLocalValue";
import { Badge, Button, inputClass } from "../../ui";

const LOOP_NEXT: Record<LoopMode, LoopMode> = { off: "queue", queue: "track", track: "off" };
const LOOP_LABEL: Record<LoopMode, string> = { off: "Loop off", queue: "Loop queue", track: "Loop track" };
const SNOWFLAKE = /^\d{17,20}$/;

export function TransportBar({ state, enabled }: { state: PlayerState; enabled: boolean }) {
  const pause = useMusicMutation(() => bot.pause(), (s) => ({ ...s, paused: true, playing: false }));
  const resume = useMusicMutation(() => bot.resume(), (s) => ({ ...s, paused: false, playing: true }));
  const skip = useMusicMutation(() => bot.skip(), (s) => ({ ...s, current: s.queue[0] ?? null, queue: s.queue.slice(1), position_seconds: 0 }));
  const stop = useMusicMutation(() => bot.stop(), (s) => ({ ...s, playing: false, paused: false, current: null, position_seconds: 0 }));
  const loop = useMusicMutation((mode: LoopMode) => bot.loop(mode), (s, mode) => ({ ...s, loop: mode }));
  const join = useMusicMutation((channelId: string) => bot.join(channelId));
  const leave = useMusicMutation(() => bot.leave());

  const [channelId, setChannelId] = useLocalValue("portal.bot.voiceChannelId");
  const current = state.current;
  const borrowed = state.owner === "recording";
  const isPlaying = state.playing && !state.paused;
  const LoopIcon = state.loop === "track" ? Repeat1 : Repeat;

  return (
    <section aria-label="Player" className="relative overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
      <div
        className={`pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-gradient-to-br from-accent to-accent-2 blur-3xl transition-opacity duration-700 ${isPlaying ? "opacity-25" : "opacity-10"}`}
        aria-hidden
      />
      <div className="relative flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-6">
          <div
            className={`grid size-20 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-accent-fg shadow-[0_16px_40px_-16px_var(--accent)] sm:size-28 ${isPlaying ? "" : "opacity-70"}`}
          >
            <Music2 className={`size-9 sm:size-12 ${isPlaying ? "animate-pulse" : ""}`} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {state.connected ? (
                <Badge tone="ok" dot>
                  In voice
                </Badge>
              ) : (
                <Badge>Not in voice</Badge>
              )}
              {borrowed && <Badge tone="danger">Sharing recording connection</Badge>}
              {state.paused && <Badge tone="warn">Paused</Badge>}
              {current && <Badge>{current.source === "r2" ? "Library" : "YouTube"}</Badge>}
            </div>
            <div className="mt-2 truncate text-xl font-semibold tracking-tight sm:text-2xl" title={current?.title}>
              {current?.title ?? "Nothing playing"}
            </div>
            <div className="text-sm text-muted">{state.queue.length ? `${state.queue.length} up next` : "Queue is empty"}</div>
            {current && (
              <Progress
                key={`${current.source}:${current.id}:${state.position_seconds}`}
                position={state.position_seconds}
                duration={current.duration_seconds}
                running={isPlaying}
              />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:w-80">
          <div className="flex items-center justify-center gap-3">
            <Button
              size="icon"
              variant="ghost"
              className={`size-11 ${state.loop !== "off" ? "text-accent" : ""}`}
              disabled={!enabled}
              onClick={() => loop.mutate(LOOP_NEXT[state.loop])}
              aria-label={`${LOOP_LABEL[state.loop]}. Change loop mode`}
              title={LOOP_LABEL[state.loop]}
            >
              <LoopIcon className="size-5" aria-hidden />
            </Button>
            <Button size="icon" variant="secondary" className="size-12 rounded-full" disabled={!enabled || !current} onClick={() => stop.mutate(undefined)} aria-label="Stop playback">
              <Square className="size-4" aria-hidden />
            </Button>
            <Button
              size="icon"
              variant="primary"
              className="size-16 rounded-full"
              disabled={!enabled || !current}
              onClick={() => (isPlaying ? pause.mutate(undefined) : resume.mutate(undefined))}
              aria-label={isPlaying ? "Pause" : "Resume"}
            >
              {isPlaying ? <Pause className="size-7" aria-hidden /> : <Play className="ml-1 size-7" aria-hidden />}
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="size-12 rounded-full"
              disabled={!enabled || (!current && !state.queue.length)}
              onClick={() => skip.mutate(undefined)}
              aria-label="Skip track"
            >
              <SkipForward className="size-5" aria-hidden />
            </Button>
            <span className="size-11" aria-hidden />
          </div>
          <VolumeSlider volume={state.volume} enabled={enabled} />
        </div>
      </div>

      {/* Voice connection. Hidden while music borrows the recording's connection: leaving would be a no-op. */}
      {!borrowed && (
        <div className="relative flex flex-wrap items-center gap-3 border-t border-border bg-surface-2/50 px-5 py-3 sm:px-7">
          <Headphones className="size-4 text-muted" aria-hidden />
          {state.connected ? (
            <>
              <span className="text-sm text-muted">
                Connected to <span className="font-mono text-text">{state.channel_id}</span>
              </span>
              <Button size="sm" variant="ghost" icon={LogOut} className="ml-auto" disabled={!enabled} busy={leave.isPending} onClick={() => leave.mutate(undefined)}>
                Leave voice
              </Button>
            </>
          ) : (
            <form
              className="flex flex-1 flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (SNOWFLAKE.test(channelId.trim())) join.mutate(channelId.trim());
              }}
            >
              <input
                className={`${inputClass} h-9 max-w-64 flex-1`}
                inputMode="numeric"
                placeholder="Voice channel id"
                aria-label="Voice channel id"
                value={channelId}
                onChange={(event) => setChannelId(event.target.value)}
              />
              <Button size="sm" type="submit" icon={LogIn} disabled={!enabled || !SNOWFLAKE.test(channelId.trim())} busy={join.isPending}>
                Join voice
              </Button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}

function Progress({ position, duration, running }: { position: number; duration: number | null; running: boolean }) {
  // Remounted (via key) whenever the server reports a new position, so the
  // anchor is always the latest reported value.
  const [anchorAt] = useState(() => Date.now());
  const [now, setNow] = useState(anchorAt);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const shown = running ? position + (now - anchorAt) / 1000 : position;
  const clamped = duration ? Math.min(shown, duration) : shown;
  const pct = duration ? Math.min(100, (clamped / duration) * 100) : 0;

  return (
    <div className="mt-4">
      <div
        className="h-2 overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-label="Track position"
        aria-valuemin={0}
        aria-valuemax={duration ?? undefined}
        aria-valuenow={Math.floor(clamped)}
      >
        <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-xs tabular-nums text-muted">
        <span>{formatDuration(clamped)}</span>
        <span>{duration ? formatDuration(duration) : "live"}</span>
      </div>
    </div>
  );
}

// Debounced to ~200ms so a drag is one request, not forty (bot limit: 60/min).
function VolumeSlider({ volume, enabled }: { volume: number; enabled: boolean }) {
  const client = useQueryClient();
  const mutation = useMusicMutation((value: number) => bot.volume(value));
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const shown = draft ?? volume;
  const Icon = shown === 0 ? VolumeX : shown < 1 ? Volume1 : Volume2;

  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="sr-only">Volume</span>
      <Icon className="size-4 shrink-0 text-muted" aria-hidden />
      <input
        type="range"
        min={0}
        max={2}
        step={0.05}
        value={shown}
        disabled={!enabled}
        className="h-8 min-w-0 flex-1"
        onChange={(event) => {
          const value = Number(event.target.value);
          setDraft(value);
          client.setQueryData<PlayerState>(keys.music, (s) => (s ? { ...s, volume: value } : s));
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            mutation.mutate(value, { onSettled: () => setDraft(null) });
          }, 200);
        }}
      />
      <span className="w-11 text-right font-mono text-xs tabular-nums text-muted">{Math.round(shown * 100)}%</span>
    </label>
  );
}
