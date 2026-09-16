"use client";

import { Library, Play, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { bot } from "@/lib/bot/client";
import type { PlayerState, Track } from "@/lib/bot/types";
import { formatDuration } from "@/lib/format";
import { useLibrary, useMusicMutation } from "@/lib/bot/useBotState";
import { useLocalValue } from "@/lib/useLocalValue";
import { useToast } from "../../Providers";
import { Button, Card, EmptyState, inputClass, Notice, Skeleton } from "../../ui";

export function usePlay(state: PlayerState) {
  const toast = useToast();
  const [channelId] = useLocalValue("portal.bot.voiceChannelId");
  const hasChannel = /^\d{17,20}$/.test(channelId.trim());
  const play = useMusicMutation((track: Track) =>
    bot.play({
      source: track.source,
      id: track.id,
      // Not in voice yet: join the remembered channel as part of play.
      ...(!state.connected && hasChannel ? { channel_id: channelId.trim() } : {}),
    }),
  );
  return {
    play: (track: Track) =>
      play.mutate(track, { onSuccess: () => toast("ok", state.current ? `Queued: ${track.title}` : `Playing: ${track.title}`) }),
    pendingId: play.isPending ? play.variables?.id : undefined,
    needsChannel: !state.connected && !hasChannel,
  };
}

export function TrackRow({ track, onPlay, busy, enabled, playing }: { track: Track; onPlay: () => void; busy: boolean; enabled: boolean; playing?: boolean }) {
  return (
    <li className={`group flex items-center gap-3 px-5 py-2.5 transition hover:bg-surface-2/60 ${playing ? "bg-accent-soft" : ""}`}>
      <Button
        size="icon"
        variant={playing ? "primary" : "secondary"}
        className="rounded-full"
        disabled={!enabled}
        busy={busy}
        onClick={onPlay}
        aria-label={`Play ${track.title}`}
      >
        {!busy && <Play className="ml-0.5 size-4" aria-hidden />}
      </Button>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm ${playing ? "font-semibold text-accent" : "font-medium"}`} title={track.title}>
          {track.title}
        </div>
      </div>
      <span className="font-mono text-xs tabular-nums text-muted">{formatDuration(track.duration_seconds)}</span>
    </li>
  );
}

export function TrackLibrary({ state, enabled }: { state: PlayerState; enabled: boolean }) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(id);
  }, [input]);

  const library = useLibrary(q);
  const { play, pendingId, needsChannel } = usePlay(state);

  if (state.sources.r2 === false) {
    return (
      <Card title="Library" icon={Library}>
        <EmptyState icon={Library} title="Library is off">
          The track library source is turned off on the bot.
        </EmptyState>
      </Card>
    );
  }

  return (
    <Card
      title="Library"
      subtitle={library.data ? `${library.data.length} tracks` : undefined}
      icon={Library}
      padded={false}
      action={
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <input
            type="search"
            className={`${inputClass} h-9 pl-9`}
            placeholder="Filter tracks"
            aria-label="Filter tracks"
            maxLength={200}
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </div>
      }
    >
      {needsChannel && (
        <div className="px-5 pt-4">
          <Notice tone="warn">The bot is not in voice. Join a channel from the player above first.</Notice>
        </div>
      )}
      {library.isPending ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : library.isError ? (
        <EmptyState icon={Library} title="Library unavailable">
          {library.error.message}
        </EmptyState>
      ) : library.data.length === 0 ? (
        <EmptyState icon={Search} title={q ? "No tracks match" : "The library is empty"} />
      ) : (
        <ul className="max-h-[34rem] divide-y divide-border overflow-y-auto py-1">
          {library.data.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              enabled={enabled}
              busy={pendingId === track.id}
              playing={state.current?.id === track.id}
              onPlay={() => play(track)}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}
