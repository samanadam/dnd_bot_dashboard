// Shapes returned by the bot API (/api/v1).
// No Discord user ids appear anywhere: speakers are display labels only.

export type Health = {
  status: string;
  ready: boolean;
  uptime_seconds: number;
  db: string | boolean;
};

export type SessionSummary = {
  id: string;
  name: string | null;
  channel_name: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  transcribed: boolean;
  cancelled: boolean;
  speakers: string[];
  speaker_count: number;
};

export type ActiveSession = {
  session_id: string;
  name: string | null;
  channel_id: string;
  channel_name: string;
  started_at: string | null;
  elapsed_seconds: number;
  speakers: string[];
  speaker_count: number;
  warnings: string[];
};

export type StopResult = {
  session_id: string;
  name: string;
  duration_seconds: number;
  speakers: string[];
  warnings: string[];
  enqueued: boolean;
};

export type TrackSource = "r2" | "youtube";

export type Track = {
  id: string;
  title: string;
  source: TrackSource;
  duration_seconds: number | null;
};

export type LoopMode = "off" | "track" | "queue";

// Where /music/play puts a track. The bot rejects anything else with a 409.
export type QueuePosition = "now" | "next" | "end";

export type PlayerState = {
  connected: boolean;
  channel_id: string | null;
  owner: "recording" | "music" | null;
  playing: boolean;
  paused: boolean;
  volume: number;
  loop: LoopMode;
  position_seconds: number;
  current: Track | null;
  queue: Track[];
  sources: Record<string, boolean>;
};

export type Stats = {
  version: string;
  sessions: { active: ActiveSession[]; pending_transcription: number };
  disk: { free_mb: number; data_bytes: number; low_disk: boolean };
  // null: local storage (nothing to reach) or not probed yet. Never "down".
  storage: { backend: string; reachable: boolean | null };
  // The plan leaves this loosely specified; treat as opaque.
  music: unknown;
};

export type DiceAnnounce = { expression: string; total: number; breakdown: string; label?: string; channel_id?: string };

export type UploadFolder = "music" | "ambience" | "sfx";

export type UploadResult = {
  id: string;
  title: string;
  folder: UploadFolder;
  size_bytes: number;
  duration_seconds: number;
};

export type SoundKind = "ambience" | "sfx";

export type SoundLayer = {
  id: string;
  kind: SoundKind;
  track_id: string;
  title: string;
  volume: number;
};

export type SoundboardState = {
  connected: boolean;
  layers: SoundLayer[];
  limits: Record<SoundKind, number>;
};

export type Soundboard = SoundboardState & { ambience: Track[]; sfx: Track[] };

export type TranscriptSegment = {
  speaker: string;
  // Seconds from the session start; null for transcripts read from Markdown.
  start: number | null;
  end: number | null;
  // HH:MM:SS: an offset when start is known, else local wall-clock time.
  clock: string | null;
  text: string;
};

export type TranscriptPage = {
  session: {
    id: string;
    name: string | null;
    started_at: string;
    ended_at: string | null;
    language: string | null;
    timezone: string | null;
    duration_seconds: number | null;
    word_count: number;
    speakers: string[];
    warnings: string[];
  };
  total: number;
  offset: number;
  limit: number;
  segments: TranscriptSegment[];
};

export type ApiErrorBody = { error: { code: string; message: string } };
