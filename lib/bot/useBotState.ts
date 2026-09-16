"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bot, BotError } from "./client";
import type { PlayerState } from "./types";

// Every poll lives here so replacing polling with SSE later is a one-file change.

export const keys = {
  health: ["bot", "health"] as const,
  stats: ["bot", "stats"] as const,
  sessions: (limit: number) => ["bot", "sessions", limit] as const,
  recording: ["bot", "recording"] as const,
  music: ["bot", "music", "state"] as const,
  library: (q: string) => ["bot", "music", "library", q] as const,
};

function retry(failureCount: number, error: Error) {
  if (error instanceof BotError && !error.unreachable && error.status !== 429) return false;
  return failureCount < 1;
}

// Back off on rate limiting, and slow down while the bot is down.
function interval(base: number) {
  return (query: { state: { error: unknown } }) => {
    const error = query.state.error;
    if (error instanceof BotError) {
      if (error.retryAfter) return Math.max(base, error.retryAfter * 1000);
      if (error.unreachable) return Math.max(base, 15_000);
    }
    return base;
  };
}

export function useHealth() {
  return useQuery({ queryKey: keys.health, queryFn: bot.health, refetchInterval: interval(15_000), retry });
}

export function useStats() {
  return useQuery({ queryKey: keys.stats, queryFn: bot.stats, refetchInterval: interval(15_000), retry });
}

export function useSessions(limit = 25) {
  return useQuery({
    queryKey: keys.sessions(limit),
    queryFn: () => bot.sessions(limit),
    refetchInterval: interval(30_000),
    retry,
  });
}

export function useActiveRecordings() {
  return useQuery({ queryKey: keys.recording, queryFn: bot.recording, refetchInterval: interval(8_000), retry });
}

export function useMusicState() {
  return useQuery({
    queryKey: keys.music,
    queryFn: bot.musicState,
    retry,
    refetchInterval: (query) => {
      const playing = (query.state.data as PlayerState | undefined)?.playing;
      // Idle still polls fairly often: joining a voice channel must show up quickly.
      return interval(playing ? 3_000 : 8_000)(query);
    },
  });
}

export function useLibrary(q: string) {
  return useQuery({
    queryKey: keys.library(q),
    queryFn: () => bot.library({ source: "r2", q: q || undefined, limit: 50 }),
    staleTime: 60_000,
    retry,
  });
}

/** True when the bot answered its last health poll and reports ready. */
export function useBotOnline() {
  const health = useHealth();
  const online = health.isSuccess && !health.isError && health.data?.ready === true;
  return { online, health };
}

function isPlayerState(value: unknown): value is PlayerState {
  return (
    !!value &&
    typeof value === "object" &&
    "queue" in value &&
    Array.isArray((value as PlayerState).queue) &&
    typeof (value as PlayerState).volume === "number"
  );
}

/**
 * Music mutation with optional optimistic update. The bot's returned
 * player_state (when it sends one) replaces the optimistic guess; otherwise the
 * state is refetched.
 */
export function useMusicMutation<TVars>(
  fn: (vars: TVars) => Promise<unknown>,
  optimistic?: (state: PlayerState, vars: TVars) => PlayerState,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onMutate: async (vars: TVars) => {
      if (!optimistic) return { previous: undefined };
      await client.cancelQueries({ queryKey: keys.music });
      const previous = client.getQueryData<PlayerState>(keys.music);
      if (previous) client.setQueryData(keys.music, optimistic(previous, vars));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(keys.music, context.previous);
    },
    onSuccess: (data) => {
      if (isPlayerState(data)) client.setQueryData(keys.music, data);
    },
    onSettled: (data) => {
      if (!isPlayerState(data)) void client.invalidateQueries({ queryKey: keys.music });
    },
  });
}

/** Recording mutation that refreshes everything recording-related afterwards. */
export function useRecordingMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void client.invalidateQueries({ queryKey: keys.recording });
      void client.invalidateQueries({ queryKey: keys.stats });
      void client.invalidateQueries({ queryKey: ["bot", "sessions"] });
      void client.invalidateQueries({ queryKey: keys.music });
    },
  });
}

export type Presence =
  | { kind: "loading" }
  | { kind: "offline" }
  | { kind: "starting" }
  | { kind: "idle" }
  | { kind: "in_voice"; channelId: string; playing: boolean }
  | { kind: "recording"; channelId: string; channelName: string; count: number };

/**
 * What the bot is doing right now, from the bot's own state: offline, idle,
 * sitting in a voice channel, or recording. Everything that needs "the channel
 * the bot is in" reads it from here, so nobody has to type channel ids while
 * the bot is already in one.
 */
export function useBotPresence(): Presence {
  const health = useHealth();
  const recordings = useActiveRecordings();
  const music = useMusicState();

  if (health.isPending) return { kind: "loading" };
  if (health.isError) return { kind: "offline" };
  if (!health.data.ready) return { kind: "starting" };

  const live = recordings.data ?? [];
  if (!recordings.isError && live.length > 0) {
    return { kind: "recording", channelId: live[0].channel_id, channelName: live[0].channel_name, count: live.length };
  }
  const player = music.isError ? undefined : music.data;
  if (player?.connected && player.channel_id) {
    return { kind: "in_voice", channelId: player.channel_id, playing: player.playing && !player.paused };
  }
  return { kind: "idle" };
}
