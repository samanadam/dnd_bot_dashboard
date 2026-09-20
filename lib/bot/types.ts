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
  campaign_id: string | null;
  campaign_name: string | null;
};

// A session in the trash: restorable until purge_at, then removed for good.
export type TrashedSession = SessionSummary & { deleted_at: string; purge_at: string | null };

export type Campaign = {
  id: string;
  name: string;
  // The voice channel that files its sessions here by default.
  channel_id: string | null;
  language: string | null;
  archived: boolean;
  session_count: number;
};

export type CampaignDetail = Campaign & {
  terms: string[];
  corrections: { heard: string; correct: string }[];
  // Labels only: Discord user ids never reach the portal.
  characters: { character_name: string; member: string | null }[];
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
  campaign_id: string | null;
  campaign_name: string | null;
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
    campaign_id: string | null;
    campaign_name: string | null;
  };
  total: number;
  offset: number;
  limit: number;
  segments: TranscriptSegment[];
};

export type SearchHit = {
  session_id: string;
  session_name: string | null;
  started_at: string;
  campaign_id: string | null;
  campaign_name: string | null;
  // Index of the line in the transcript, for opening it at that spot.
  seq: number;
  speaker: string;
  clock: string | null;
  start: number | null;
  // The matched words are wrapped in [[ and ]].
  snippet: string;
};

export type SearchResponse = { query: string; results: SearchHit[]; still_indexing: number };

export type QueueItem = {
  session_id: string;
  name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  // uploading: still on the bot. waiting: in the bucket or with the transcriber.
  status: "uploading" | "waiting" | "transcribing";
  queued_at: string;
  waiting_seconds: number | null;
  stalled: boolean;
};

export type TranscriptionQueue = { items: QueueItem[]; can_sync: boolean };

export type InitiativeReport = { id: number; label: string; value: number; at: string };

export type ApiErrorBody = { error: { code: string; message: string } };
