"use client";

import type {
  ActiveSession,
  ApiErrorBody,
  DiceAnnounce,
  Health,
  LoopMode,
  PlayerState,
  SessionSummary,
  Soundboard,
  SoundboardState,
  SoundKind,
  Stats,
  StopResult,
  Track,
  TranscriptPage,
  QueuePosition,
  TrackSource,
  UploadFolder,
  UploadResult,
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
  announceDice: (body: DiceAnnounce) => call<{ sent: true; channel_id: string }>("POST", "dice/announce", body),

  deleteTrack: (id: string) => call<{ deleted: string }>("POST", "music/delete", { id }),
  soundboard: () => call<Soundboard>("GET", "soundboard"),
  playSound: (input: { kind: SoundKind; id: string; volume?: number; channel_id?: string }) =>
    call<SoundboardState>("POST", "soundboard/play", input),
  stopSound: (input: { layer_id?: string; kind?: SoundKind } = {}) => call<SoundboardState>("POST", "soundboard/stop", input),
  soundVolume: (layer_id: string, volume: number) => call<SoundboardState>("POST", "soundboard/volume", { layer_id, volume }),
  transcript: (sessionId: string, offset: number, limit = 500) =>
    call<TranscriptPage>("GET", `sessions/${encodeURIComponent(sessionId)}/transcript?offset=${offset}&limit=${limit}`),
};

/**
 * Upload one audio file with progress. XHR rather than fetch: fetch still has
 * no upload progress events in browsers.
 */
export function uploadTrack(
  file: File,
  folder: UploadFolder,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const search = new URLSearchParams({ folder, filename: file.name });
    xhr.open("POST", `/api/bot/music/upload?${search}`);
    xhr.setRequestHeader("x-portal-request", "1");
    xhr.setRequestHeader("Content-Type", file.type.startsWith("audio/") ? file.type : "application/octet-stream");
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onerror = () => reject(new BotError(0, "network_error", "The upload was interrupted."));
    xhr.onabort = () => reject(new BotError(0, "aborted", "Upload cancelled."));
    xhr.onload = () => {
      if (xhr.status === 401) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/signin?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
        reject(new BotError(401, "unauthorized", "Session expired."));
        return;
      }
      const data = xhr.response as UploadResult | ApiErrorBody | null;
      if (xhr.status >= 200 && xhr.status < 300 && data && "id" in data) {
        resolve(data);
        return;
      }
      const error = data && "error" in data ? data.error : null;
      reject(new BotError(xhr.status, error?.code ?? "internal_error", error?.message ?? `Upload failed (${xhr.status}).`));
    };
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}
