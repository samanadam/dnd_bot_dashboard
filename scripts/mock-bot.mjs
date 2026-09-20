// A stand-in for the bot API so the portal can be developed and demoed without
// Discord. Implements the bot API contract with in-memory
// state. Development only: never point a deployed portal at this.
//
//   MOCK_BOT_TOKEN=... node scripts/mock-bot.mjs    (listens on 127.0.0.1:8787)

import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";

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
  { id: "2026-09-16-2030-a1b2c3d4", name: "Session 3: The Sunken Keep", channel_name: "table", started_at: hoursAgo(26), ended_at: hoursAgo(22), duration_seconds: 14400, transcribed: false, cancelled: false, speakers: ["DM", "Aria", "Borin", "Cass"], speaker_count: 4 },
  { id: "2026-09-09-2015-b2c3d4e5", name: "Session 2", channel_name: "table", started_at: hoursAgo(170), ended_at: hoursAgo(167), duration_seconds: 10800, transcribed: true, cancelled: false, speakers: ["DM", "Aria", "Borin"], speaker_count: 3 },
  { id: "2026-09-02-2000-c3d4e5f6", name: null, channel_name: "table", started_at: hoursAgo(340), ended_at: null, duration_seconds: null, transcribed: false, cancelled: false, speakers: ["DM"], speaker_count: 1 },
];
const campaigns = [
  { id: "a1b2c3d4e5f6", name: "Curse of Strahd", channel_id: null, language: "tr", archived: false, terms: ["Barovia", "Ireena"], corrections: [{ heard: "bar ovya", correct: "Barovia" }], characters: [{ character_name: "Thorin", member: "Eren" }] },
  { id: "f6e5d4c3b2a1", name: "Sunless Citadel", channel_id: null, language: null, archived: false, terms: [], corrections: [], characters: [] },
];
const campaignView = (c) => ({ id: c.id, name: c.name, channel_id: c.channel_id, language: c.language, archived: c.archived, session_count: sessions.filter((s) => s.campaign_id === c.id).length });
const withCampaign = (s) => ({ campaign_id: null, ...s, campaign_name: campaigns.find((c) => c.id === s.campaign_id)?.name ?? null });
const initiative = [
  { id: 1, label: "Aria", value: 17, at: new Date().toISOString() },
  { id: 2, label: "Borin", value: 9, at: new Date().toISOString() },
];
const queueView = () => ({
  can_sync: true,
  items: sessions
    .filter((s) => s.ended_at && !s.transcribed && !s.cancelled)
    .map((s) => ({ session_id: s.id, name: s.name, campaign_id: withCampaign(s).campaign_id, campaign_name: withCampaign(s).campaign_name, status: "waiting", queued_at: s.ended_at, waiting_seconds: 3600 * 20, stalled: false })),
});
const active = new Map();
const player = {
  connected: false, channel_id: null, owner: null, playing: false, paused: false,
  volume: 1, loop: "off", position_seconds: 0, current: null, queue: [],
  sources: { r2: true, youtube: true, soundcloud: true },
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
  "GET sessions": (_body, query) => {
    const wanted = query.get("campaign");
    const rows = sessions.filter((s) => !wanted || (wanted === "unassigned" ? !s.campaign_id : s.campaign_id === wanted));
    return ok(rows.slice(0, Number(query.get("limit") ?? 25)).map(withCampaign));
  },
  "GET transcripts/search": (_body, query) => {
    const q = (query.get("q") ?? "").trim();
    const done = sessions.filter((s) => s.transcribed);
    return ok({
      query: q,
      still_indexing: 0,
      results: done.map((s, i) => ({
        session_id: s.id, session_name: s.name, started_at: s.started_at, campaign_id: withCampaign(s).campaign_id, campaign_name: withCampaign(s).campaign_name,
        seq: i + 1, speaker: "Aria", clock: "00:12:0" + i, start: 720 + i, snippet: `the party met the [[${q}]] near the old mill`,
      })),
    });
  },
  "GET transcription": () => ok(queueView()),
  "POST transcription/sync": () => ok({ uploaded: 1, fetched: 0, ...queueView() }),
  "POST music/seek": (body) => {
    if (!player.current) return fail(409, "conflict", "Nothing is playing.");
    state();
    player.position_seconds = Math.min(player.current.duration_seconds ?? Infinity, body.position_seconds);
    positionAnchor = Date.now();
    return ok(state());
  },
  "GET initiative": () => ok(initiative),
  "POST initiative/clear": (body) => {
    const before = initiative.length;
    for (let i = initiative.length - 1; i >= 0; i--) if (body.id === undefined || initiative[i].id === body.id) initiative.splice(i, 1);
    return ok({ removed: before - initiative.length });
  },
  "GET campaigns": (_body, query) => ok(campaigns.filter((c) => query.get("archived") === "1" || !c.archived).map(campaignView)),
  "POST campaigns": (body) => {
    if (campaigns.some((c) => c.name.toLowerCase() === String(body.name).toLowerCase())) return fail(409, "conflict", "A campaign with that name exists.");
    const created = { id: randomUUID().replaceAll("-", "").slice(0, 12), name: body.name, channel_id: body.channel_id ?? null, language: body.language ?? null, archived: false, terms: [], corrections: [], characters: [] };
    campaigns.push(created);
    return ok(campaignView(created), 201);
  },
  "GET recording": () => ok([...active.values()].map(activeView)),
  "POST recording/start": (body) => {
    if (active.has(body.channel_id)) return fail(409, "conflict", "Already recording in that channel.");
    const session = { session_id: randomUUID(), name: body.name ?? null, channel_id: body.channel_id, channel_name: "table", started: Date.now(), speakers: ["DM", "Aria"], warnings: [], campaign_id: body.campaign_id ?? campaigns.find((c) => c.channel_id === body.channel_id)?.id ?? null };
    active.set(body.channel_id, session);
    return ok(activeView(session), 201);
  },
  "POST recording/stop": (body) => {
    const session = active.get(body.channel_id);
    if (!session) return fail(404, "not_found", "Nothing is recording in that channel.");
    active.delete(body.channel_id);
    const duration = Math.floor((Date.now() - session.started) / 1000);
    sessions.unshift({ id: session.session_id, name: session.name, channel_name: session.channel_name, started_at: new Date(session.started).toISOString(), ended_at: new Date().toISOString(), duration_seconds: duration, transcribed: false, cancelled: false, speakers: session.speakers, speaker_count: session.speakers.length, campaign_id: session.campaign_id });
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
  "POST music/search": (body) => {
    // A pasted watch link resolves to that one video, the way the real resolver does.
    const link = /^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})$/.exec(body.query);
    if (link && body.source === "youtube") return ok([{ id: body.query, title: `Video ${link[1]}`, source: "youtube", duration_seconds: 95 }]);
    const cloud = SOUNDCLOUD.exec(body.query);
    if (cloud && body.source === "soundcloud") return ok([{ id: body.query, title: `Track ${cloud[2]}`, source: "soundcloud", duration_seconds: 95 }]);
    if (body.source === "soundcloud") {
      return ok([1, 2, 3].map((n) => ({ id: `https://soundcloud.com/mock-artist/${createHash("sha1").update(`${body.query}:${n}`).digest("hex").slice(0, 8)}`, title: `${body.query} (track ${n})`, source: "soundcloud", duration_seconds: 240 * n })));
    }
    return ok([1, 2, 3].map((n) => ({ id: `https://www.youtube.com/watch?v=${createHash("sha1").update(`${body.query}:${n}`).digest("base64url").slice(0, 11)}`, title: `${body.query} (result ${n})`, source: "youtube", duration_seconds: 180 * n })));
  },
  "POST music/play": (body) => {
    const track = library.find((t) => t.id === body.id) ?? (body.source === "youtube" || body.source === "soundcloud" ? { id: body.id, title: body.id, source: body.source, duration_seconds: 240 } : null);
    if (!track) return fail(404, "not_found", "Unknown track.");
    if (!player.connected) {
      if (!body.channel_id) return fail(409, "conflict", "The bot is not in a voice channel. Give a channel_id.");
      Object.assign(player, { connected: true, channel_id: body.channel_id, owner: active.size ? "recording" : "music" });
    }
    if (player.current && body.position === "now") Object.assign(player, { current: track, playing: true, paused: false, position_seconds: 0 });
    else if (player.current && body.position === "next") player.queue.unshift(track);
    else if (player.current) player.queue.push(track);
    else Object.assign(player, { current: track, playing: true, paused: false, position_seconds: 0 });
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
  "POST dice/announce": (body) => (console.log(`dice: ${body.label ?? ""} ${body.expression} = ${body.total} (${body.breakdown})`), ok({ sent: true, channel_id: "100000000000000001" })),
  "POST music/leave": () => (Object.assign(player, { connected: false, channel_id: null, owner: null, playing: false, current: null }), ok(state())),

  "POST music/delete": (body) => {
    const index = library.findIndex((t) => t.id === body.id);
    if (index === -1) return fail(404, "not_found", "No such track.");
    library.splice(index, 1);
    return ok({ deleted: body.id });
  },
  "GET soundboard": () => ok({ ambience: sounds.ambience, sfx: sounds.sfx, ...boardState() }),
  // YouTube sounds are saved once on the bot, then played from disk. The mock
  // pretends: any plain watch link works, and one over the limit is refused.
  "POST soundboard/prepare": (body) => {
    const track = webSound(body);
    return typeof track === "string" ? fail(502, "resolver_failed", track) : ok(track);
  },
  "POST soundboard/play": (body) => {
    const track = body.source === "youtube" || body.source === "soundcloud" ? webSound(body) : sounds[body.kind]?.find((t) => t.id === body.id);
    if (typeof track === "string") return fail(502, "resolver_failed", track);
    if (!track) return fail(404, "not_found", `No such ${body.kind} sound.`);
    if (!player.connected) {
      if (!body.channel_id) return fail(409, "conflict", "Not connected to a voice channel; name one to join.");
      Object.assign(player, { connected: true, channel_id: body.channel_id, owner: "music" });
    }
    if (body.kind === "ambience" && layers.some((l) => l.track_id === track.id)) return fail(409, "conflict", "That ambience is already playing.");
    const layer = { id: randomUUID().replace(/-/g, "").slice(0, 8), kind: body.kind, track_id: track.id, title: track.title, volume: body.volume ?? 1 };
    layers.push(layer);
    // One-shots end by themselves.
    if (body.kind === "sfx") {
      setTimeout(() => {
        const at = layers.indexOf(layer);
        if (at !== -1) layers.splice(at, 1);
      }, 4000);
    }
    return ok(boardState());
  },
  "POST soundboard/stop": (body) => {
    if (body.layer_id) {
      const index = layers.findIndex((l) => l.id === body.layer_id);
      if (index === -1) return fail(409, "conflict", "That sound is not playing.");
      layers.splice(index, 1);
    } else {
      for (let i = layers.length - 1; i >= 0; i--) if (!body.kind || layers[i].kind === body.kind) layers.splice(i, 1);
    }
    return ok(boardState());
  },
  "POST soundboard/volume": (body) => {
    const layer = layers.find((l) => l.id === body.layer_id);
    if (!layer) return fail(409, "conflict", "That sound is not playing.");
    layer.volume = body.volume;
    return ok(boardState());
  },
};

const SOUNDCLOUD = /^https:\/\/soundcloud\.com\/([a-z0-9_-]{1,120})\/([a-z0-9_-]{1,120})$/;

function webSound(body) {
  if (body.source === "soundcloud") {
    const cloud = SOUNDCLOUD.exec(body.id ?? "");
    if (!cloud) return "Ambience and effects need a plain SoundCloud track link.";
    if (cloud[2].startsWith("long")) return `That is longer than the ${body.kind === "sfx" ? "60 second" : "30 minute"} limit for ${body.kind === "sfx" ? "effects" : "ambience"}.`;
    return { id: body.id, title: `Track ${cloud[2]}`, source: "soundcloud", duration_seconds: 12 };
  }
  const link = /^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})$/.exec(body.id ?? "");
  if (!link) return "Ambience and effects need a plain YouTube video link.";
  // Ids starting with "long" stand in for a video over the length limit.
  if (link[1].startsWith("long")) return `That is longer than the ${body.kind === "sfx" ? "60 second" : "30 minute"} limit for ${body.kind === "sfx" ? "effects" : "ambience"}.`;
  return { id: body.id, title: `Video ${link[1]}`, source: "youtube", duration_seconds: 12 };
}

const sounds = {
  ambience: [
    ["rain-on-roof", "Rain on the Roof"],
    ["tavern-crowd", "Tavern Crowd"],
    ["cave-drips", "Cave Drips"],
    ["campfire", "Campfire"],
    ["storm-wind", "Storm Wind"],
  ].map(([id, title]) => ({ id: `music/ambience/${id}.ogg`, title, source: "r2", duration_seconds: null })),
  sfx: [
    ["door-creak", "Door Creak"],
    ["thunder", "Thunder"],
    ["dragon-roar", "Dragon Roar"],
    ["sword-clash", "Sword Clash"],
    ["fireball", "Fireball"],
    ["wolf-howl", "Wolf Howl"],
  ].map(([id, title]) => ({ id: `music/sfx/${id}.ogg`, title, source: "r2", duration_seconds: null })),
};
const layers = [];

function boardState() {
  return { connected: player.connected, layers, limits: { ambience: 3, sfx: 6 } };
}

function activeView(s) {
  return { session_id: s.session_id, name: s.name, channel_id: s.channel_id, channel_name: s.channel_name, started_at: new Date(s.started).toISOString(), elapsed_seconds: Math.floor((Date.now() - s.started) / 1000), speakers: s.speakers, speaker_count: s.speakers.length, warnings: s.warnings };
}

async function upload(req, query) {
  const folder = query.get("folder");
  const filename = query.get("filename") ?? "";
  const declared = Number(req.headers["content-length"] ?? "NaN");
  if (!["music", "ambience", "sfx"].includes(folder)) return fail(400, "bad_folder", "folder must be music, ambience or sfx.");
  if (!Number.isFinite(declared)) return fail(411, "length_required", "Send the file size (Content-Length).");
  let size = 0;
  let head = Buffer.alloc(0);
  for await (const chunk of req) {
    if (head.length < 16) head = Buffer.concat([head, chunk]).subarray(0, 16);
    size += chunk.length;
  }
  if (size !== declared) return fail(400, "incomplete_upload", "The upload did not complete.");
  const title = filename.replace(/\.[^.]+$/, "");
  const id = `music/${folder === "music" ? "" : `${folder}/`}${filename}`;
  const known = [...library, ...sounds.ambience, ...sounds.sfx].some((t) => t.id === id || t.title === title);
  if (known) return fail(409, "already_exists", "A file with that name already exists.");
  if (!/^(OggS|ID3|fLaC|RIFF)/.test(head.toString("latin1")) && head[0] !== 0xff && head.subarray(4, 8).toString("latin1") !== "ftyp") {
    return fail(415, "not_audio", "That file is not a valid audio file.");
  }
  const track = { id, title, source: "r2", duration_seconds: 42 };
  if (folder === "music") library.push(track);
  else sounds[folder].push(track);
  console.log(`upload: ${id} (${size} bytes)`);
  return ok({ id, title, folder, size_bytes: size, duration_seconds: 42 }, 201);
}

function transcript(id, query) {
  const session = sessions.find((s) => s.id === id);
  if (!session) return fail(404, "not_found", "No such session.");
  if (!session.transcribed) return fail(404, "no_transcript", "This session has no transcript yet.");
  const lines = [
    ["DM", "Rüzgâr kulenin taşlarında uğulduyor. Kapının önünde üç goblin var, ellerinde paslı kılıçlar."],
    ["Aria", "Gizlice yaklaşmak istiyorum. Stealth atıyorum."],
    ["DM", "Tamam, zar at."],
    ["Aria", "On yedi."],
    ["Borin", "Ben arkadan geliyorum ama zırhım çok ses çıkarıyor, dezavantajla atıyorum sanırım."],
    ["DM", "Evet, dezavantaj. Goblinlerden biri başını kaldırıyor."],
    ["Borin", "Dokuz. Kötü."],
    ["DM", "Goblin bağırıyor: kim var orada! Initiative atın."],
  ];
  const segments = Array.from({ length: 240 }, (_, n) => {
    const [speaker, text] = lines[n % lines.length];
    const start = 12 + n * 17.5;
    const whole = Math.floor(start);
    const clock = [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60].map((v) => String(v).padStart(2, "0")).join(":");
    return { speaker, start, end: start + 6, clock, text };
  });
  const offset = Number(query.get("offset") ?? 0);
  const limit = Number(query.get("limit") ?? 500);
  return ok({
    session: {
      id: session.id, name: session.name, started_at: session.started_at, ended_at: session.ended_at,
      language: "tr", timezone: "Europe/Istanbul", duration_seconds: session.duration_seconds,
      word_count: segments.reduce((sum, s) => sum + s.text.split(" ").length, 0),
      speakers: ["Aria", "Borin", "DM"], warnings: [],
      campaign_id: withCampaign(session).campaign_id, campaign_name: withCampaign(session).campaign_name,
    },
    total: segments.length, offset, limit, segments: segments.slice(offset, offset + limit),
  });
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/^\/api\/v1\/?/, "");
  let result;

  if (path !== "health" && req.headers.authorization !== `Bearer ${TOKEN}`) {
    result = fail(401, "unauthorized", "Bad token.");
  } else if (req.method === "POST" && path === "music/upload") {
    result = await upload(req, url.searchParams);
  } else {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    const index = path.match(/^music\/queue\/(\d+)$/);
    const transcriptPath = path.match(/^sessions\/([a-z0-9-]+)\/transcript$/);
    const campaignPath = path.match(/^campaigns\/([a-f0-9]{12})(?:\/(update|terms|corrections))?$/);
    const assignPath = path.match(/^sessions\/([a-z0-9-]+)\/campaign$/);
    if (campaignPath) {
      const target = campaigns.find((c) => c.id === campaignPath[1]);
      if (!target) result = fail(404, "not_found", "No such campaign.");
      else if (req.method === "GET" && !campaignPath[2]) result = ok({ ...campaignView(target), terms: target.terms, corrections: target.corrections, characters: target.characters });
      else if (req.method === "POST" && campaignPath[2] === "update") {
        Object.assign(target, body);
        result = ok(campaignView(target));
      } else if (req.method === "POST" && campaignPath[2] === "terms") {
        target.terms = body.terms;
        result = ok({ ...campaignView(target), terms: target.terms, corrections: target.corrections, characters: target.characters });
      } else if (req.method === "POST" && campaignPath[2] === "corrections") {
        target.corrections = body.corrections;
        result = ok({ ...campaignView(target), terms: target.terms, corrections: target.corrections, characters: target.characters });
      } else result = fail(404, "not_found", "No such route.");
    } else if (req.method === "POST" && assignPath) {
      const target = sessions.find((s) => s.id === assignPath[1]);
      if (!target) result = fail(404, "not_found", "No such session.");
      else if (!target.ended_at) result = fail(409, "conflict", "That session is still being recorded.");
      else if (body.campaign_id && !campaigns.some((c) => c.id === body.campaign_id)) result = fail(404, "not_found", "No such campaign.");
      else {
        target.campaign_id = body.campaign_id;
        result = ok(withCampaign(target));
      }
    } else if (req.method === "GET" && transcriptPath) {
      result = transcript(transcriptPath[1], url.searchParams);
    } else if (req.method === "DELETE" && index) {
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
