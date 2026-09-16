// A stand-in for the bot API so the portal can be developed and demoed without
// Discord. Implements the bot API contract with in-memory
// state. Development only: never point a deployed portal at this.
//
//   MOCK_BOT_TOKEN=... node scripts/mock-bot.mjs    (listens on 127.0.0.1:8787)

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.MOCK_BOT_PORT ?? 8787);
const TOKEN = process.env.MOCK_BOT_TOKEN ?? process.env.BOT_API_TOKEN;
if (!TOKEN) {
  console.error("Set MOCK_BOT_TOKEN (the same value as the portal's BOT_API_TOKEN).");
  process.exit(1);
}

const started = Date.now();
const library = [
  ["tavern-ambience", "Tavern Ambience", 1840],
  ["dungeon-drips", "Dungeon Drips", 912],
  ["battle-drums", "Battle Drums", 245],
  ["forest-night", "Forest at Night", 1320],
  ["dragon-theme", "The Dragon Wakes", 318],
  ["market-bustle", "Market Bustle", 1105],
].map(([id, title, duration_seconds]) => ({ id, title, source: "r2", duration_seconds }));

const sessions = [
  { id: "s-003", name: "Session 3: The Sunken Keep", channel_name: "table", started_at: hoursAgo(26), ended_at: hoursAgo(22), duration_seconds: 14400, transcribed: false, cancelled: false, speakers: ["DM", "Aria", "Borin", "Cass"], speaker_count: 4 },
  { id: "s-002", name: "Session 2", channel_name: "table", started_at: hoursAgo(170), ended_at: hoursAgo(167), duration_seconds: 10800, transcribed: true, cancelled: false, speakers: ["DM", "Aria", "Borin"], speaker_count: 3 },
  { id: "s-001", name: null, channel_name: "table", started_at: hoursAgo(340), ended_at: null, duration_seconds: null, transcribed: false, cancelled: false, speakers: ["DM"], speaker_count: 1 },
];
const active = new Map();
const player = {
  connected: false, channel_id: null, owner: null, playing: false, paused: false,
  volume: 1, loop: "off", position_seconds: 0, current: null, queue: [],
  sources: { r2: true, youtube: true },
};
let positionAnchor = Date.now();

function hoursAgo(h) {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

function state() {
  if (player.playing && !player.paused && player.current) {
    player.position_seconds = Math.min(
      player.current.duration_seconds ?? Infinity,
      player.position_seconds + (Date.now() - positionAnchor) / 1000,
    );
  }
  positionAnchor = Date.now();
  return { ...player, position_seconds: Math.floor(player.position_seconds) };
}

const fail = (status, code, message) => ({ status, body: { error: { code, message } } });
const ok = (body, status = 200) => ({ status, body });

const routes = {
  "GET health": () => ok({ status: "ok", ready: true, uptime_seconds: Math.floor((Date.now() - started) / 1000), db: "ok" }),
  "GET stats": () =>
    ok({
      version: "1.4.0-mock",
      sessions: { active: [...active.values()].map(activeView), pending_transcription: sessions.filter((s) => s.ended_at && !s.transcribed && !s.cancelled).length },
      disk: { free_mb: 18_432, data_bytes: 7_340_032_000, low_disk: false },
      storage: { backend: "r2", reachable: true },
      music: { enabled: true },
    }),
  "GET sessions": (_body, query) => ok(sessions.slice(0, Number(query.get("limit") ?? 25))),
  "GET recording": () => ok([...active.values()].map(activeView)),
  "POST recording/start": (body) => {
    if (active.has(body.channel_id)) return fail(409, "conflict", "Already recording in that channel.");
    const session = { session_id: randomUUID(), name: body.name ?? null, channel_id: body.channel_id, channel_name: "table", started: Date.now(), speakers: ["DM", "Aria"], warnings: [] };
    active.set(body.channel_id, session);
    return ok(activeView(session), 201);
  },
  "POST recording/stop": (body) => {
    const session = active.get(body.channel_id);
    if (!session) return fail(404, "not_found", "Nothing is recording in that channel.");
    active.delete(body.channel_id);
    const duration = Math.floor((Date.now() - session.started) / 1000);
    sessions.unshift({ id: session.session_id, name: session.name, channel_name: session.channel_name, started_at: new Date(session.started).toISOString(), ended_at: new Date().toISOString(), duration_seconds: duration, transcribed: false, cancelled: false, speakers: session.speakers, speaker_count: session.speakers.length });
    return ok({ session_id: session.session_id, name: session.name ?? "Untitled", duration_seconds: duration, speakers: session.speakers, warnings: [], enqueued: true });
  },
  "POST recording/cancel": (body) => {
    const session = active.get(body.channel_id);
    if (!session) return fail(404, "not_found", "Nothing is recording in that channel.");
    active.delete(body.channel_id);
    return ok({ session_id: session.session_id });
  },
  "POST recording/recover": (body) => {
    const session = sessions.find((s) => s.id === body.session_id);
    if (!session || session.ended_at) return fail(409, "conflict", "That session is not recoverable.");
    session.ended_at = new Date().toISOString();
    session.duration_seconds = 3600;
    return ok({ session_id: session.id, name: session.name ?? "Untitled", duration_seconds: 3600, speakers: session.speakers, warnings: ["Last 40 seconds of audio were unreadable."], enqueued: true });
  },
  "GET music/state": () => ok(state()),
  "GET music/library": (_body, query) => {
    const q = (query.get("q") ?? "").toLowerCase();
    return ok(library.filter((t) => t.title.toLowerCase().includes(q)).slice(0, Number(query.get("limit") ?? 50)));
  },
  "POST music/search": (body) =>
    ok([1, 2, 3].map((n) => ({ id: `yt-${n}-${encodeURIComponent(body.query)}`, title: `${body.query} (result ${n})`, source: "youtube", duration_seconds: 180 * n }))),
  "POST music/play": (body) => {
    const track = library.find((t) => t.id === body.id) ?? (body.source === "youtube" ? { id: body.id, title: body.id, source: "youtube", duration_seconds: 240 } : null);
    if (!track) return fail(404, "not_found", "Unknown track.");
    if (!player.connected) {
      if (!body.channel_id) return fail(409, "conflict", "The bot is not in a voice channel. Give a channel_id.");
      Object.assign(player, { connected: true, channel_id: body.channel_id, owner: active.size ? "recording" : "music" });
    }
    if (player.current) player.queue.push(track);
    else Object.assign(player, { current: track, playing: true, paused: false, position_seconds: body.position ?? 0 });
    return ok(state(), 202);
  },
  "POST music/pause": () => (state(), Object.assign(player, { paused: true }), ok(state())),
  "POST music/resume": () => (state(), Object.assign(player, { paused: false, playing: !!player.current }), ok(state())),
  "POST music/skip": () => {
    const next = player.queue.shift() ?? null;
    Object.assign(player, { current: next, playing: !!next, paused: false, position_seconds: 0 });
    return ok(state());
  },
  "POST music/stop": () => (Object.assign(player, { current: null, playing: false, paused: false, position_seconds: 0, queue: [] }), ok(state())),
  "POST music/volume": (body) => (state(), (player.volume = body.volume), ok(state())),
  "POST music/loop": (body) => ((player.loop = body.mode), ok(state())),
  "DELETE music/queue": () => ((player.queue = []), ok(state())),
  "POST music/queue/move": (body) => {
    if (body.from >= player.queue.length || body.to >= player.queue.length) return fail(400, "bad_request", "Index out of range.");
    const [track] = player.queue.splice(body.from, 1);
    player.queue.splice(body.to, 0, track);
    return ok(state());
  },
  "POST music/join": (body) => (Object.assign(player, { connected: true, channel_id: body.channel_id, owner: active.size ? "recording" : "music" }), ok(state())),
  "POST music/leave": () => (Object.assign(player, { connected: false, channel_id: null, owner: null, playing: false, current: null }), ok(state())),
};

function activeView(s) {
  return { session_id: s.session_id, name: s.name, channel_id: s.channel_id, channel_name: s.channel_name, started_at: new Date(s.started).toISOString(), elapsed_seconds: Math.floor((Date.now() - s.started) / 1000), speakers: s.speakers, speaker_count: s.speakers.length, warnings: s.warnings };
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/^\/api\/v1\/?/, "");
  let result;

  if (path !== "health" && req.headers.authorization !== `Bearer ${TOKEN}`) {
    result = fail(401, "unauthorized", "Bad token.");
  } else {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    const index = path.match(/^music\/queue\/(\d+)$/);
    if (req.method === "DELETE" && index) {
      player.queue.splice(Number(index[1]), 1);
      result = ok(state());
    } else {
      const handler = routes[`${req.method} ${path}`];
      result = handler ? handler(body, url.searchParams) : fail(404, "not_found", "No such route.");
    }
  }

  res.writeHead(result.status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result.body));
}).listen(PORT, "127.0.0.1", () => console.log(`mock bot on http://127.0.0.1:${PORT}/api/v1`));
