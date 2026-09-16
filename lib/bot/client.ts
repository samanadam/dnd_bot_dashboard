"use client";

import type {
  ActiveSession,
  ApiErrorBody,
  Health,
  LoopMode,
  PlayerState,
  SessionSummary,
  Stats,
  StopResult,
  Track,
  QueuePosition,
  TrackSource,
} from "./types";

// Browser-side client. It only ever talks to the portal's own /api/bot proxy;
// the bot URL and token are unknown to this code.

export class BotError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "BotError";
  }

  /** The bot (or the network path to it) is down, not a user mistake. */
  get unreachable() {
    return this.status === 0 || this.code === "bot_unreachable" || this.code === "upstream_timeout";
  }
}

async function call<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/bot/${path}`, {
      method,
      headers: {
        "x-portal-request": "1",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new BotError(0, "network_error", "Cannot reach the portal. Check your connection.");
  }

  if (response.status === 401) {
    // Portal session ended (signed out or role revoked): go sign in again.
    // Full navigation on purpose: drop all client state and re-run the server gate.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/signin?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
    throw new BotError(401, "unauthorized", "Session expired.");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (data as ApiErrorBody | null)?.error;
    const retry = Number(response.headers.get("retry-after"));
    throw new BotError(
      response.status,
      error?.code ?? "internal_error",
      error?.message ?? `Request failed (${response.status}).`,
      Number.isFinite(retry) && retry > 0 ? retry : undefined,
    );
  }
  return data as T;
}

export const bot = {
  health: () => call<Health>("GET", "health"),
  stats: () => call<Stats>("GET", "stats"),
  sessions: (limit = 25) => call<SessionSummary[]>("GET", `sessions?limit=${limit}`),
  recording: () => call<ActiveSession[]>("GET", "recording"),

  startRecording: (input: { channel_id: string; name?: string; text_channel_id?: string }) =>
    call<ActiveSession>("POST", "recording/start", input),
  stopRecording: (channel_id: string) => call<StopResult>("POST", "recording/stop", { channel_id }),
  cancelRecording: (channel_id: string) =>
    call<{ session_id: string }>("POST", "recording/cancel", { channel_id }),
  recoverRecording: (session_id: string) => call<StopResult>("POST", "recording/recover", { session_id }),

  musicState: () => call<PlayerState>("GET", "music/state"),
  library: (params: { source?: TrackSource; q?: string; limit?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.source) search.set("source", params.source);
    if (params.q) search.set("q", params.q);
    if (params.limit) search.set("limit", String(params.limit));
    return call<Track[]>("GET", `music/library${search.size ? `?${search}` : ""}`);
  },
  search: (source: TrackSource, query: string) => call<Track[]>("POST", "music/search", { source, query }),
  play: (input: { source: TrackSource; id: string; channel_id?: string; position?: QueuePosition }) =>
    call<PlayerState>("POST", "music/play", input),
  pause: () => call<PlayerState>("POST", "music/pause"),
  resume: () => call<PlayerState>("POST", "music/resume"),
  skip: () => call<PlayerState>("POST", "music/skip"),
  stop: () => call<PlayerState>("POST", "music/stop"),
  volume: (volume: number) => call<PlayerState>("POST", "music/volume", { volume }),
  loop: (mode: LoopMode) => call<PlayerState>("POST", "music/loop", { mode }),
  clearQueue: () => call<PlayerState>("DELETE", "music/queue"),
  removeFromQueue: (index: number) => call<PlayerState>("DELETE", `music/queue/${index}`),
  moveInQueue: (from: number, to: number) => call<PlayerState>("POST", "music/queue/move", { from, to }),
  join: (channel_id: string) => call<PlayerState>("POST", "music/join", { channel_id }),
  leave: () => call<PlayerState>("POST", "music/leave"),
};
