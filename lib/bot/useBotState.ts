"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bot, BotError } from "./client";
import type { PlayerState, Soundboard, SoundboardState, TranscriptPage, TranscriptSegment } from "./types";

// Every poll lives here so replacing polling with SSE later is a one-file change.

export const keys = {
  health: ["bot", "health"] as const,
  stats: ["bot", "stats"] as const,
  // Under ["bot", "sessions"], so every session change refreshes it too.
  trash: ["bot", "sessions", "trash"] as const,
  sessions: (limit: number, campaign: string | null) => ["bot", "sessions", limit, campaign ?? "all"] as const,
  search: (q: string, campaign: string | null) => ["bot", "search", q, campaign ?? "all"] as const,
  queue: ["bot", "transcription"] as const,
  initiative: ["bot", "initiative"] as const,
  campaigns: ["bot", "campaigns"] as const,
  campaign: (id: string) => ["bot", "campaign", id] as const,
  recording: ["bot", "recording"] as const,
  music: ["bot", "music", "state"] as const,
  library: (q: string) => ["bot", "music", "library", q] as const,
  soundboard: ["bot", "soundboard"] as const,
  transcript: (id: string) => ["bot", "transcript", id] as const,
};

// A four-hour session is a few thousand segments; this cap is far above that.
const TRANSCRIPT_PAGE = 500;
const TRANSCRIPT_MAX_PAGES = 60;

export type Transcript = { session: TranscriptPage["session"]; segments: TranscriptSegment[]; truncated: boolean };

export function useTranscript(sessionId: string) {
  return useQuery({
    queryKey: keys.transcript(sessionId),
    queryFn: async (): Promise<Transcript> => {
      const first = await bot.transcript(sessionId, 0, TRANSCRIPT_PAGE);
      const segments = [...first.segments];
      let pages = 1;
      while (segments.length < first.total && pages < TRANSCRIPT_MAX_PAGES) {
        const page = await bot.transcript(sessionId, segments.length, TRANSCRIPT_PAGE);
        if (page.segments.length === 0) break;
        segments.push(...page.segments);
        pages += 1;
      }
      return { session: first.session, segments, truncated: segments.length < first.total };
    },
    staleTime: 5 * 60_000,
    retry,
  });
}

export function useSoundboard() {
  return useQuery({
    queryKey: keys.soundboard,
    queryFn: bot.soundboard,
    refetchInterval: interval(5_000),
    retry,
  });
}

/** Soundboard mutation: the bot answers with the new layer state. */
export function useSoundboardMutation<TVars>(fn: (vars: TVars) => Promise<SoundboardState>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (state) => {
      client.setQueryData<Soundboard>(keys.soundboard, (previous) => (previous ? { ...previous, ...state } : previous));
    },
    onSettled: () => void client.invalidateQueries({ queryKey: keys.music }),
  });
}

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

/** `campaign` is a campaign id, "unassigned", or null for every session. */
export function useSessions(limit = 25, campaign: string | null = null) {
  return useQuery({
    queryKey: keys.sessions(limit, campaign),
    queryFn: () => bot.sessions(limit, campaign ?? undefined),
    refetchInterval: interval(30_000),
    retry,
  });
}

export function useTranscriptSearch(q: string, campaign: string | null) {
  return useQuery({
    queryKey: keys.search(q, campaign),
    queryFn: () => bot.searchTranscripts(q, campaign ?? undefined),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    retry,
  });
}

export function useTranscriptionQueue() {
  return useQuery({ queryKey: keys.queue, queryFn: bot.transcription, refetchInterval: interval(30_000), retry });
}

/** Sync now: on success the queue, stats and sessions are refreshed. */
export function useSyncTranscription() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: bot.syncTranscription,
    onSuccess: (data) => client.setQueryData(keys.queue, { items: data.items, can_sync: data.can_sync }),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: keys.stats });
      void client.invalidateQueries({ queryKey: ["bot", "sessions"] });
    },
  });
}

/** Every campaign, archived ones included; callers filter what they show. */
export function useCampaigns() {
  return useQuery({
    queryKey: keys.campaigns,
    queryFn: () => bot.campaigns(true),
    staleTime: 30_000,
    retry,
  });
}

export function useCampaign(id: string) {
  return useQuery({ queryKey: keys.campaign(id), queryFn: () => bot.campaign(id), staleTime: 15_000, retry });
}

/** Campaign edits and session assignment change what several lists show. */
export function useCampaignMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void client.invalidateQueries({ queryKey: keys.campaigns });
      void client.invalidateQueries({ queryKey: ["bot", "campaign"] });
      void client.invalidateQueries({ queryKey: ["bot", "sessions"] });
      void client.invalidateQueries({ queryKey: ["bot", "transcript"] });
    },
  });
}

/** Renaming or deleting a session changes every list that mentions it. */
export function useSessionMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      for (const queryKey of [keys.stats, keys.queue, keys.campaigns, ["bot", "campaign"], ["bot", "sessions"], ["bot", "search"], ["bot", "transcript"]]) {
        void client.invalidateQueries({ queryKey });
      }
    },
  });
}

/** The trash is only readable by the DM; other users never ask for it. */
export function useTrash(enabled: boolean) {
  return useQuery({ queryKey: keys.trash, queryFn: bot.trash, enabled, refetchInterval: interval(60_000), retry });
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
