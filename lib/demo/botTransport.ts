"use client";

import { matchRule } from "@/lib/bot/allowlist";
import { BotError } from "@/lib/bot/client";
import type {
  ActiveSession,
  Campaign,
  CampaignDetail,
  PlayerState,
  SearchHit,
  SessionSummary,
  SoundboardState,
  Stats,
  Track,
  TranscriptPage,
  TranscriptionQueue,
  UploadFolder,
  UploadResult,
} from "@/lib/bot/types";
import { DEMO_TEXT_CHANNEL, type DemoActive, type DemoCampaign, type DemoSession, type DemoState } from "./fixtures";
import { readDemo, updateDemo } from "./store";

// The bot, played by the browser. Every call is checked against the same
// allowlist and schemas the real proxy uses, so the demo refuses what the portal
// would refuse, and then answered from the in-memory store. No request leaves
// the tab.

type Body = Record<string, unknown>;
type Handler = (params: string[], body: Body, query: URLSearchParams) => unknown;

const fail = (status: number, code: string, message: string): never => {
  throw new BotError(status, code, message);
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const campaignName = (state: DemoState, id: string | null) => state.bot.campaigns.find((c) => c.id === id)?.name ?? null;
const sessionView = (state: DemoState, s: DemoSession): SessionSummary => ({ ...s, campaign_name: campaignName(state, s.campaign_id) });
const campaignView = (state: DemoState, c: DemoCampaign): Campaign => ({
  id: c.id,
  name: c.name,
  channel_id: c.channel_id,
  language: c.language,
  archived: c.archived,
  session_count: state.bot.sessions.filter((s) => s.campaign_id === c.id).length,
});
const campaignDetail = (state: DemoState, c: DemoCampaign): CampaignDetail => ({
  ...campaignView(state, c),
  terms: c.terms,
  corrections: c.corrections,
  characters: c.characters,
});
const activeView = (state: DemoState, a: DemoActive): ActiveSession => ({
  session_id: a.session_id,
  name: a.name,
  channel_id: a.channel_id,
  channel_name: a.channel_name,
  started_at: new Date(a.started).toISOString(),
  elapsed_seconds: Math.floor((Date.now() - a.started) / 1000),
  speakers: a.speakers,
  speaker_count: a.speakers.length,
  warnings: a.warnings,
  campaign_id: a.campaign_id,
  campaign_name: campaignName(state, a.campaign_id),
});

/** Where the track is now; a finished track moves the queue on, as the bot would. */
function settlePlayer(state: DemoState) {
  const player = state.bot.player;
  const now = Date.now();
  if (player.playing && !player.paused && player.current) {
    player.position += (now - player.anchor) / 1000;
    const length = player.current.duration_seconds;
    while (length !== null && player.current && player.position >= (player.current.duration_seconds ?? Infinity)) {
      player.position -= player.current.duration_seconds ?? 0;
      if (player.loop === "track") continue;
      if (player.loop === "queue") player.queue.push(player.current);
      player.current = player.queue.shift() ?? null;
      if (!player.current) Object.assign(player, { playing: false, position: 0 });
    }
  }
  player.anchor = now;
}

function playerView(state: DemoState): PlayerState {
  const p = state.bot.player;
  const live = p.playing && !p.paused && p.current ? (Date.now() - p.anchor) / 1000 : 0;
  return {
    connected: p.connected,
    channel_id: p.channel_id,
    owner: p.owner,
    playing: p.playing,
    paused: p.paused,
    volume: p.volume,
    loop: p.loop,
    position_seconds: Math.floor(Math.min(p.current?.duration_seconds ?? Infinity, p.position + live)),
    current: p.current,
    queue: p.queue,
    sources: { r2: true, youtube: true, soundcloud: true },
  };
}

function boardView(state: DemoState): SoundboardState {
  return { connected: state.bot.player.connected, layers: state.bot.layers, limits: { ambience: 3, sfx: 6 } };
}

function queueView(state: DemoState): TranscriptionQueue {
  return {
    can_sync: true,
    items: state.bot.sessions
      .filter((s) => s.ended_at && !s.transcribed && !s.cancelled)
      .map((s) => ({
        session_id: s.id,
        name: s.name,
        campaign_id: s.campaign_id,
        campaign_name: campaignName(state, s.campaign_id),
        status: "transcribing" as const,
        queued_at: s.ended_at!,
        waiting_seconds: Math.floor((Date.now() - Date.parse(s.ended_at!)) / 1000),
        stalled: false,
      })),
  };
}

function findSession(state: DemoState, id: string): DemoSession {
  return state.bot.sessions.find((s) => s.id === id) ?? fail(404, "not_found", "No such session.");
}

function findCampaign(state: DemoState, id: string): DemoCampaign {
  return state.bot.campaigns.find((c) => c.id === id) ?? fail(404, "not_found", "No such campaign.");
}

function webTrack(source: string, id: string, title?: string): Track {
  const name = title ?? id.replace(/^https:\/\/(www\.youtube\.com\/watch\?v=|soundcloud\.com\/)/, "");
  return { id, title: name, source: source as Track["source"], duration_seconds: 180 };
}

function joinIfNeeded(state: DemoState, channel: unknown) {
  const player = state.bot.player;
  if (player.connected) return;
  if (typeof channel !== "string") fail(409, "conflict", "The bot is not in a voice channel. Pick one first.");
  Object.assign(player, { connected: true, channel_id: channel, owner: state.bot.active.length ? "recording" : "music" });
}

const TRANSCRIPT = [
  ["DM", "The wind howls through the broken tower. Three goblins wait by the door, rusty blades in hand."],
  ["Aria", "I want to sneak up on them. Rolling stealth."],
  ["DM", "Go ahead, roll it."],
  ["Aria", "Seventeen."],
  ["Borin", "I follow, but my armour clanks. That's disadvantage, right?"],
  ["DM", "It is. One of the goblins lifts its head and sniffs."],
  ["Borin", "Nine. Not great."],
  ["Cass", "I cast Bless on Aria and Borin before they see us."],
  ["DM", "The goblin shouts: who goes there! Roll initiative."],
  ["Aria", "Twelve plus three, fifteen."],
  ["DM", "Mayor Hollis said the map was in the mill. The goblins are guarding it for someone."],
  ["Cass", "Then someone in Hollowmere is paying them."],
] as const;

const clock = (seconds: number) =>
  [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, Math.floor(seconds) % 60].map((v) => String(v).padStart(2, "0")).join(":");

function transcriptLines(count: number) {
  return Array.from({ length: count }, (_, n) => {
    const [speaker, text] = TRANSCRIPT[n % TRANSCRIPT.length];
    const start = 12 + n * 17.5;
    return { speaker, start, end: start + 6, clock: clock(start), text };
  });
}

const routes: Record<string, Handler> = {
  "GET health": () => ({ status: "ok", ready: true, uptime_seconds: Math.floor((Date.now() - readDemo().bot.startedAt) / 1000), db: "ok" }),
  "GET stats": (): Stats => {
    const state = readDemo();
    return {
      version: "demo",
      sessions: { active: state.bot.active.map((a) => activeView(state, a)), pending_transcription: queueView(state).items.length },
      disk: { free_mb: 18_432, data_bytes: 7_340_032_000, low_disk: false },
      storage: { backend: "r2", reachable: true },
      music: { enabled: true },
    };
  },
  "GET sessions": (_p, _b, query) => {
    const state = readDemo();
    const wanted = query.get("campaign");
    return state.bot.sessions
      .filter((s) => !wanted || (wanted === "unassigned" ? !s.campaign_id : s.campaign_id === wanted))
      .slice(0, Number(query.get("limit") ?? 25))
      .map((s) => sessionView(state, s));
  },
  "GET recording": () => {
    const state = readDemo();
    return state.bot.active.map((a) => activeView(state, a));
  },
  "GET transcripts/search": (_p, _b, query) => {
    const state = readDemo();
    const q = (query.get("q") ?? "").trim();
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const campaign = query.get("campaign");
    const lines = transcriptLines(TRANSCRIPT.length);
    const results: SearchHit[] = [];
    for (const s of state.bot.sessions) {
      if (!s.transcribed || (campaign && s.campaign_id !== campaign)) continue;
      lines.forEach((line, seq) => {
        if (!words.length || !words.every((w) => line.text.toLowerCase().includes(w))) return;
        const snippet = line.text.replace(new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi"), "[[$1]]");
        results.push({
          session_id: s.id,
          session_name: s.name,
          started_at: s.started_at,
          campaign_id: s.campaign_id,
          campaign_name: campaignName(state, s.campaign_id),
          seq,
          speaker: line.speaker,
          clock: line.clock,
          start: line.start,
          snippet,
        });
      });
    }
    return { query: q, results: results.slice(0, Number(query.get("limit") ?? 30)), still_indexing: 0 };
  },
  "GET transcription": () => queueView(readDemo()),
  "POST transcription/sync": () =>
    updateDemo((state) => {
      // Pretend the transcriber caught up with everything waiting.
      const waiting = queueView(state).items.map((item) => item.session_id);
      for (const s of state.bot.sessions) if (waiting.includes(s.id)) s.transcribed = true;
      return { uploaded: 0, fetched: waiting.length, ...queueView(state) };
    }),
  "GET sessions/:session/transcript": ([id], _b, query): TranscriptPage => {
    const state = readDemo();
    const s = findSession(state, id);
    if (!s.transcribed) fail(404, "no_transcript", "This session has no transcript yet.");
    const segments = transcriptLines(240);
    const offset = Number(query.get("offset") ?? 0);
    const limit = Number(query.get("limit") ?? 500);
    return {
      session: {
        id: s.id,
        name: s.name,
        started_at: s.started_at,
        ended_at: s.ended_at,
        language: "en",
        timezone: "Europe/Istanbul",
        duration_seconds: s.duration_seconds,
        word_count: segments.reduce((sum, seg) => sum + seg.text.split(" ").length, 0),
        speakers: ["Aria", "Borin", "Cass", "DM"],
        warnings: [],
        campaign_id: s.campaign_id,
        campaign_name: campaignName(state, s.campaign_id),
      },
      total: segments.length,
      offset,
      limit,
      segments: segments.slice(offset, offset + limit),
    };
  },
  "POST recording/start": (_p, body) =>
    updateDemo((state) => {
      if (state.bot.active.some((a) => a.channel_id === body.channel_id)) fail(409, "conflict", "Already recording in that channel.");
      const campaign = (body.campaign_id as string | undefined) ?? state.bot.campaigns.find((c) => c.channel_id === body.channel_id)?.id ?? null;
      const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-").replace(/-(\d\d)$/, "$1");
      const session: DemoActive = {
        session_id: `${stamp}-${Math.random().toString(16).slice(2, 10).padEnd(8, "0")}`,
        name: (body.name as string | undefined) ?? null,
        channel_id: body.channel_id as string,
        channel_name: "the-table",
        started: Date.now(),
        speakers: ["DM", "Aria", "Borin", "Cass"],
        warnings: [],
        campaign_id: campaign,
      };
      state.bot.active.push(session);
      return activeView(state, session);
    }),
  "POST recording/stop": (_p, body) =>
    updateDemo((state) => {
      const index = state.bot.active.findIndex((a) => a.channel_id === body.channel_id);
      if (index === -1) fail(404, "not_found", "Nothing is recording in that channel.");
      const [session] = state.bot.active.splice(index, 1);
      const duration = Math.max(1, Math.floor((Date.now() - session.started) / 1000));
      state.bot.sessions.unshift({
        id: session.session_id,
        name: session.name,
        channel_name: session.channel_name,
        started_at: new Date(session.started).toISOString(),
        ended_at: new Date().toISOString(),
        duration_seconds: duration,
        transcribed: false,
        cancelled: false,
        speakers: session.speakers,
        speaker_count: session.speakers.length,
        campaign_id: session.campaign_id,
      });
      return { session_id: session.session_id, name: session.name ?? "Untitled", duration_seconds: duration, speakers: session.speakers, warnings: [], enqueued: true };
    }),
  "POST recording/cancel": (_p, body) =>
    updateDemo((state) => {
      const index = state.bot.active.findIndex((a) => a.channel_id === body.channel_id);
      if (index === -1) fail(404, "not_found", "Nothing is recording in that channel.");
      const [session] = state.bot.active.splice(index, 1);
      return { session_id: session.session_id };
    }),
  "POST recording/recover": (_p, body) =>
    updateDemo((state) => {
      const s = findSession(state, body.session_id as string);
      if (s.ended_at) fail(409, "conflict", "That session is not recoverable.");
      s.ended_at = new Date(Date.parse(s.started_at) + 3600_000).toISOString();
      s.duration_seconds = 3600;
      return { session_id: s.id, name: s.name ?? "Untitled", duration_seconds: 3600, speakers: s.speakers, warnings: ["Last 40 seconds of audio were unreadable."], enqueued: true };
    }),
  "GET campaigns": (_p, _b, query) => {
    const state = readDemo();
    return state.bot.campaigns.filter((c) => query.get("archived") === "1" || !c.archived).map((c) => campaignView(state, c));
  },
  "GET campaigns/:campaign": ([id]) => {
    const state = readDemo();
    return campaignDetail(state, findCampaign(state, id));
  },
  "POST campaigns": (_p, body) =>
    updateDemo((state) => {
      const name = String(body.name);
      if (state.bot.campaigns.some((c) => c.name.toLowerCase() === name.toLowerCase())) fail(409, "conflict", "A campaign with that name exists.");
      const created: DemoCampaign = {
        id: Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join(""),
        name,
        channel_id: (body.channel_id as string | undefined) ?? null,
        language: (body.language as string | undefined) ?? null,
        archived: false,
        terms: [],
        corrections: [],
        characters: [],
      };
      state.bot.campaigns.push(created);
      return campaignView(state, created);
    }),
  "POST campaigns/:campaign/update": ([id], body) =>
    updateDemo((state) => {
      const c = findCampaign(state, id);
      Object.assign(c, body);
      return campaignView(state, c);
    }),
  "POST campaigns/:campaign/terms": ([id], body) =>
    updateDemo((state) => {
      const c = findCampaign(state, id);
      c.terms = body.terms as string[];
      return campaignDetail(state, c);
    }),
  "POST campaigns/:campaign/corrections": ([id], body) =>
    updateDemo((state) => {
      const c = findCampaign(state, id);
      c.corrections = body.corrections as DemoCampaign["corrections"];
      return campaignDetail(state, c);
    }),
  "POST sessions/:session/campaign": ([id], body) =>
    updateDemo((state) => {
      const s = findSession(state, id);
      if (!s.ended_at) fail(409, "conflict", "That session is still being recorded.");
      const campaign = body.campaign_id as string | null;
      if (campaign) findCampaign(state, campaign);
      s.campaign_id = campaign;
      return sessionView(state, s);
    }),
  "POST sessions/:session/update": ([id], body) =>
    updateDemo((state) => {
      const s = findSession(state, id);
      s.name = String(body.name);
      return sessionView(state, s);
    }),
  "GET sessions/trash": () => {
    const state = readDemo();
    return state.bot.trash.map(({ session, deleted_at }) => ({
      ...sessionView(state, session),
      deleted_at,
      purge_at: new Date(Date.parse(deleted_at) + 30 * 24 * 3600_000).toISOString(),
    }));
  },
  "POST sessions/:session/trash": ([id], body) =>
    updateDemo((state) => {
      if (body.confirm_id !== id) fail(400, "bad_request", "The confirmation does not match the session.");
      const index = state.bot.sessions.findIndex((s) => s.id === id);
      if (index === -1) fail(404, "not_found", "No such session.");
      const [session] = state.bot.sessions.splice(index, 1);
      const deleted_at = new Date().toISOString();
      state.bot.trash.unshift({ session, deleted_at });
      return { ...sessionView(state, session), deleted_at, purge_at: new Date(Date.now() + 30 * 24 * 3600_000).toISOString() };
    }),
  "POST sessions/:session/restore": ([id], body) =>
    updateDemo((state) => {
      if (body.confirm_id !== id) fail(400, "bad_request", "The confirmation does not match the session.");
      const index = state.bot.trash.findIndex((t) => t.session.id === id);
      if (index === -1) fail(404, "not_found", "That session is not in the trash.");
      const [{ session }] = state.bot.trash.splice(index, 1);
      state.bot.sessions.push(session);
      state.bot.sessions.sort((a, b) => b.started_at.localeCompare(a.started_at));
      return sessionView(state, session);
    }),
  "POST sessions/:session/purge": ([id], body) =>
    updateDemo((state) => {
      if (body.confirm_id !== id) fail(400, "bad_request", "The confirmation does not match the session.");
      const index = state.bot.trash.findIndex((t) => t.session.id === id);
      if (index === -1) fail(404, "not_found", "That session is not in the trash.");
      state.bot.trash.splice(index, 1);
      return { purged: id, files_removed: 7, bytes_freed: 412_000_000 };
    }),
  "GET music/state": () => updateDemo((state) => (settlePlayer(state), playerView(state))),
  "GET music/library": (_p, _b, query) => {
    const q = (query.get("q") ?? "").toLowerCase();
    return readDemo()
      .bot.library.filter((t) => t.title.toLowerCase().includes(q))
      .slice(0, Number(query.get("limit") ?? 50));
  },
  "POST music/search": (_p, body) => {
    const query = String(body.query);
    if (/^https:\/\//.test(query)) return [webTrack(String(body.source), query)];
    const words = ["tavern", "battle", "forest", "rain"].includes(query.toLowerCase()) ? query : query.slice(0, 40);
    return [1, 2, 3].map((n) => {
      const id = String(body.source) === "soundcloud" ? `https://soundcloud.com/demo-artist/${words.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${n}` : `https://www.youtube.com/watch?v=demo${String(n).padStart(7, "0")}`;
      return { id, title: `${words} (demo result ${n})`, source: body.source as Track["source"], duration_seconds: 180 * n };
    });
  },
  "POST music/play": (_p, body) =>
    updateDemo((state) => {
      settlePlayer(state);
      const found = state.bot.library.find((t) => t.id === body.id);
      const track = found ?? (body.source === "youtube" || body.source === "soundcloud" ? webTrack(String(body.source), String(body.id)) : fail(404, "not_found", "Unknown track."));
      joinIfNeeded(state, body.channel_id);
      const player = state.bot.player;
      if (!player.current || body.position === "now") Object.assign(player, { current: track, playing: true, paused: false, position: 0 });
      else if (body.position === "next") player.queue.unshift(track);
      else player.queue.push(track);
      return playerView(state);
    }),
  "POST music/pause": () => updateDemo((state) => (settlePlayer(state), (state.bot.player.paused = true), playerView(state))),
  "POST music/resume": () =>
    updateDemo((state) => {
      settlePlayer(state);
      Object.assign(state.bot.player, { paused: false, playing: !!state.bot.player.current });
      return playerView(state);
    }),
  "POST music/skip": () =>
    updateDemo((state) => {
      const next = state.bot.player.queue.shift() ?? null;
      Object.assign(state.bot.player, { current: next, playing: !!next, paused: false, position: 0, anchor: Date.now() });
      return playerView(state);
    }),
  "POST music/stop": () =>
    updateDemo((state) => {
      Object.assign(state.bot.player, { current: null, playing: false, paused: false, position: 0, queue: [] });
      return playerView(state);
    }),
  "POST music/seek": (_p, body) =>
    updateDemo((state) => {
      settlePlayer(state);
      const player = state.bot.player;
      if (!player.current) fail(409, "conflict", "Nothing is playing.");
      player.position = Math.min(player.current!.duration_seconds ?? Infinity, Number(body.position_seconds));
      return playerView(state);
    }),
  "POST music/volume": (_p, body) => updateDemo((state) => (settlePlayer(state), (state.bot.player.volume = Number(body.volume)), playerView(state))),
  "POST music/loop": (_p, body) => updateDemo((state) => ((state.bot.player.loop = body.mode as DemoState["bot"]["player"]["loop"]), playerView(state))),
  "DELETE music/queue": () => updateDemo((state) => ((state.bot.player.queue = []), playerView(state))),
  "DELETE music/queue/:index": ([index]) =>
    updateDemo((state) => {
      if (Number(index) >= state.bot.player.queue.length) fail(400, "bad_request", "Index out of range.");
      state.bot.player.queue.splice(Number(index), 1);
      return playerView(state);
    }),
  "POST music/queue/move": (_p, body) =>
    updateDemo((state) => {
      const queue = state.bot.player.queue;
      const from = Number(body.from);
      const to = Number(body.to);
      if (from >= queue.length || to >= queue.length) fail(400, "bad_request", "Index out of range.");
      const [moved] = queue.splice(from, 1);
      queue.splice(to, 0, moved);
      return playerView(state);
    }),
  "POST music/join": (_p, body) =>
    updateDemo((state) => {
      Object.assign(state.bot.player, { connected: true, channel_id: body.channel_id, owner: state.bot.active.length ? "recording" : "music" });
      return playerView(state);
    }),
  "POST music/leave": () =>
    updateDemo((state) => {
      Object.assign(state.bot.player, { connected: false, channel_id: null, owner: null, playing: false, paused: false, current: null, position: 0 });
      state.bot.layers = [];
      return playerView(state);
    }),
  "POST music/delete": (_p, body) =>
    updateDemo((state) => {
      for (const list of [state.bot.library, state.bot.ambience, state.bot.sfx]) {
        const index = list.findIndex((t) => t.id === body.id);
        if (index !== -1) {
          list.splice(index, 1);
          return { deleted: body.id };
        }
      }
      return fail(404, "not_found", "No such track.");
    }),
  "POST dice/announce": (_p, body) => ({ sent: true, channel_id: (body.channel_id as string | undefined) ?? DEMO_TEXT_CHANNEL }),
  "GET initiative": () => readDemo().bot.initiative,
  "POST initiative/clear": (_p, body) =>
    updateDemo((state) => {
      const before = state.bot.initiative.length;
      state.bot.initiative = state.bot.initiative.filter((r) => body.id !== undefined && r.id !== body.id);
      return { removed: before - state.bot.initiative.length };
    }),
  "GET soundboard": () => {
    const state = readDemo();
    return { ambience: state.bot.ambience, sfx: state.bot.sfx, ...boardView(state) };
  },
  "POST soundboard/prepare": (_p, body) => webTrack(String(body.source), String(body.id)),
  "POST soundboard/play": (_p, body) => {
    const result = updateDemo((state) => {
      const kind = body.kind as "ambience" | "sfx";
      const web = body.source === "youtube" || body.source === "soundcloud";
      const track = web ? webTrack(String(body.source), String(body.id)) : state.bot[kind].find((t) => t.id === body.id);
      if (!track) fail(404, "not_found", `No such ${kind} sound.`);
      joinIfNeeded(state, body.channel_id);
      if (kind === "ambience" && state.bot.layers.some((l) => l.track_id === track!.id)) fail(409, "conflict", "That ambience is already playing.");
      if (state.bot.layers.filter((l) => l.kind === kind).length >= (kind === "ambience" ? 3 : 6)) fail(409, "conflict", `At most ${kind === "ambience" ? 3 : 6} at once.`);
      const layer = { id: Math.random().toString(16).slice(2, 10).padEnd(8, "0"), kind, track_id: track!.id, title: track!.title, volume: (body.volume as number | undefined) ?? 1 };
      state.bot.layers.push(layer);
      return { view: boardView(state), layer };
    });
    // One-shots end by themselves.
    if (result.layer.kind === "sfx") {
      setTimeout(() => updateDemo((state) => void (state.bot.layers = state.bot.layers.filter((l) => l.id !== result.layer.id))), 4000);
    }
    return result.view;
  },
  "POST soundboard/stop": (_p, body) =>
    updateDemo((state) => {
      if (body.layer_id) {
        if (!state.bot.layers.some((l) => l.id === body.layer_id)) fail(409, "conflict", "That sound is not playing.");
        state.bot.layers = state.bot.layers.filter((l) => l.id !== body.layer_id);
      } else {
        state.bot.layers = state.bot.layers.filter((l) => body.kind && l.kind !== body.kind);
      }
      return boardView(state);
    }),
  "POST soundboard/volume": (_p, body) =>
    updateDemo((state) => {
      const layer = state.bot.layers.find((l) => l.id === body.layer_id) ?? fail(409, "conflict", "That sound is not playing.");
      layer.volume = Number(body.volume);
      return boardView(state);
    }),
};

/** Answers one bot client call from the demo store. */
export async function demoBotCall<T>(method: string, path: string, body?: unknown): Promise<T> {
  await wait(120);
  const url = new URL(path, "https://demo.invalid/");
  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const match = matchRule(method, segments);
  if (!match) fail(404, "not_found", "No such endpoint.");
  const { rule } = match!;

  const query = new URLSearchParams();
  if (rule.query) {
    const parsed = rule.query.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) fail(400, "bad_request", "Invalid query parameters.");
    for (const [key, value] of Object.entries(parsed.data!)) if (value !== undefined) query.set(key, value);
  }
  let input: Body = {};
  if (rule.body) {
    const parsed = rule.body.safeParse(body ?? {});
    if (!parsed.success) {
      const issue = parsed.error!.issues[0];
      fail(400, "bad_request", `Invalid ${issue?.path.join(".") || "body"}: ${issue?.message ?? "invalid"}`);
    }
    input = parsed.data!;
  }

  const pattern = rule.path.split("/");
  const params = segments.filter((_, i) => pattern[i]?.startsWith(":"));
  const handler = routes[`${method} ${rule.path}`] ?? fail(404, "not_found", "The demo does not do that.");
  // A copy, so nothing a component does to the answer can reach the store.
  return structuredClone(handler(params, input, query)) as T;
}

/** A pretend upload: progress, then the file is listed. The file itself is never read. */
export async function demoUpload(file: File, folder: UploadFolder, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<UploadResult> {
  for (let step = 1; step <= 10; step++) {
    if (signal?.aborted) fail(0, "aborted", "Upload cancelled.");
    await wait(90);
    onProgress(step / 10);
  }
  const title = file.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Untitled";
  const id = `music/${folder === "music" ? "" : `${folder}/`}${file.name}`;
  return updateDemo((state) => {
    const list = folder === "music" ? state.bot.library : state.bot[folder];
    if (list.some((t) => t.id === id)) fail(409, "already_exists", "A file with that name already exists.");
    list.push({ id, title, source: "r2", duration_seconds: folder === "music" ? 180 : null });
    return { id, title, folder, size_bytes: file.size, duration_seconds: 42 };
  });
}
