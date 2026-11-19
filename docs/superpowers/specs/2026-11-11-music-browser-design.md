# Music browser: play any site's sound into the Discord voice channel

Date: 2026-11-11
Repos: `dnd_bot` (bot API) and `dnd_bot_dashboard` (portal)
Status: **option A (cast a tab) built** on branch `feat/music-cast` in both repos; the
spike (step 0) is replaced by testing the real thing. Phase 2 (requests) is not built.
The bot reuses `API_CORS_ORIGINS` as the allowed socket origin instead of a new
`PORTAL_ORIGIN`, and the demo twin and mock bot were skipped.

## The request, as understood

> A browser inside the app for music and sound. People go to YouTube or any
> other sound website in it and play straight into the Discord channel.
> People can direct it.

Two readings of "people can direct" are possible and they lead to different
builds, so both are covered:

- **(a)** one person at a time picks what plays, and others with access can take over;
- **(b)** everyone looks at and drives the *same* browser together.

This design recommends (a) and lists what (b) costs.

## What exists today

- Paste a YouTube or SoundCloud link, or search, and the bot resolves it with
  yt-dlp and plays it (`components/bot/music/WebSearch.tsx`, `dnd_bot/ytdlp.py`).
- Only two sites, each with one strict link form. Every other site is refused
  on purpose (`docs/security.md`, "A saved YouTube or SoundCloud link…").
- On the server YouTube often asks for a sign-in, which is why SoundCloud is
  the recommended source in the README.
- The bot mixes one main source plus soundboard layers as 20 ms PCM frames
  (`dnd_bot/mixer.py`). Anything that can produce 48 kHz stereo PCM frames can
  be played.

## Hard limits that shape the answer

1. **A web page cannot show youtube.com (or most sites) inside itself.** Those
   sites forbid being framed. A true "browser in a page" means a real browser
   running somewhere else, with its picture streamed to the page.
2. **The bot container has 1 GB of memory and one CPU** (`dnd_bot/docker-compose.yml`),
   a read-only file system and no extra privileges. A browser does not fit in it.
3. **The portal's rules:** the bot token never reaches the browser, every bot
   call is allowlisted and validated, the content policy allows no outside
   frames or scripts (`proxy.ts`), and the front proxy caps bodies at 64 KB.
4. **Server address problem:** sites treat a data-centre address as a robot.
   A browser on the VPS will meet the same YouTube sign-in wall the resolver
   meets today.

## Three ways to build it

| | A. Cast a tab | B. Shared browser on the server | C. More sites in the link resolver |
|---|---|---|---|
| What the user does | Opens any site in a normal browser tab, clicks "Cast a tab" in the portal, picks the tab | Sees a remote Chromium inside the portal page and drives it with mouse and keyboard | Pastes a link from more sites |
| Works with | Any site that makes sound, with the user's own logins | Any site, but as an anonymous server visitor | Only sites yt-dlp supports and we allow one by one |
| "In the app" | The controls are; the site is in the next tab | Yes, fully | No browsing at all |
| Several people driving together | No: one caster at a time, hand-over by button | Yes | Not applicable |
| Server cost | One extra ffmpeg while casting | A new container: about 2 GB memory, 1 to 2 CPUs, plus video encoding | None |
| Phones | No (desktop Chrome and Edge only) | Yes | Yes |
| New risk | A new WebSocket into the bot | A browser on your server that players steer: it can reach the server's own network unless walled off, and holds whatever accounts get logged into it | Each new site is a new parser of hostile input |
| Size | Medium: one portal page, one bot module, one proxy rule | Large: new service, streaming, isolation, audio routing | Small per site |

### Recommendation

**Build A first.** It is the only option that plays *any* site, uses the
listener's own account and home address (so no sign-in wall), and costs the
server almost nothing. Then add a small "requests" list (phase 2) so players
can direct what plays without holding the controls.

**B only if "everyone drives the same browser" is the actual wish**, and only
on a bigger server. It is specified at the end as an option, not planned.

**C is not this feature.** It stays as its own small follow-up when one
specific site is wanted.

## Design of A: cast a tab

### How it feels

1. The DM (or anyone with the Music permission) opens **Sound → Cast**.
2. The page says: "Open the site you want in another tab, start it playing,
   then press Cast a tab."
3. The browser's own picker opens. They choose the tab and tick "Also share
   tab audio".
4. The transport bar shows **Live: Aria's tab** with a level meter, a volume
   slider and **Stop casting**. Pause, skip and seek are hidden for a live cast.
5. Everyone in voice hears it about one second later. Soundboard layers still
   mix on top.
6. Stop casting, closing the tab or losing the connection ends it; the queue
   continues with the next track.
7. Someone else with the permission presses **Take over**: the first cast is
   stopped and theirs starts. One cast per server at a time.

Not supported, said plainly on the page: Firefox and Safari (they cannot share
tab audio), phones, and sharing a whole screen (tab only, so no other sound
leaks in).

### Moving the sound

```
tab audio ──getDisplayMedia──> MediaRecorder (webm/opus, 128 kbit, 100 ms chunks)
          ──WebSocket (binary)──> Caddy /cast/ws ──> bot aiohttp /api/v1/cast/ws
          ──> ffmpeg (stdin webm → stdout s16le 48 kHz stereo)
          ──> CastSource.read() one 3840-byte frame per 20 ms
          ──> PCMVolumeTransformer ──> MixerSource main (or voice_client.play)
```

- The video track that `getDisplayMedia` insists on is stopped at once; no
  picture ever leaves the browser.
- `CastSource` keeps a small buffer (target 300 ms, cap 2 s). When it runs dry
  it returns silence, never a short frame, so the mixer does not think the
  track ended. When it overflows it drops the oldest audio so delay cannot grow.
- A cast is a `Track` with `source="cast"`; `MusicManager` starts it through
  the same `_start` path as any track, so recording hand-over, the mixer and
  volume keep working unchanged.

### Letting the browser in without giving it the token

The browser must never hold `BOT_API_TOKEN`, and the portal (Next.js
standalone) cannot serve WebSockets itself. So:

1. Browser → portal: `POST /api/bot/cast/start` (new allowlist rule,
   permission `bot.music`, audited, `recording` rate bucket: 10 a minute).
2. Portal → bot: same path with the token. Bot answers
   `{ cast_id, ticket, expires_in: 30 }`. The ticket is 32 random bytes, works
   once, for 30 seconds, for that one cast.
3. Browser opens `wss://<portal host>/cast/ws` and sends the ticket as its
   **first message** (not in the URL, so it never lands in an access log).
4. Caddy forwards `/cast/ws` to the bot at `127.0.0.1:8080/api/v1/cast/ws`.
   This is the only bot path the outside world can reach.
5. The bot's WebSocket handler is outside bearer auth (like `/health`) and
   does its own checks: `Origin` must equal the configured portal origin, the
   first message must be a live ticket within 5 seconds, then binary frames only.

`POST /api/bot/cast/stop` (same permission) and the existing `music/stop` end a
cast. `GET music/state` gains `cast: { by_name, started_at } | null`.

### Limits the bot enforces

| Limit | Value | Why |
|---|---|---|
| Casts per server | 1 | One voice connection |
| Data rate | closed above 64 KB/s averaged over 5 s | 128 kbit is 16 KB/s; this stops a flood |
| Message size | 256 KB | aiohttp `max_msg_size` |
| Silence from the client | closed after 10 s without data | Dead tabs |
| Length | 6 hours | A forgotten cast |
| ffmpeg input | `-f webm -protocol_whitelist pipe`, stdin only | No file or network access |
| Off switch | `MUSIC_CAST_ENABLED=false` by default | Same pattern as `MUSIC_YTDLP_ENABLED` |

### What changes where

**Bot (`dnd_bot`)**

- `cast.py` (new): tickets, `CastSource`, the ffmpeg pipe, limits.
- `api/routes_cast.py` (new): `POST cast/start`, `POST cast/stop`, `GET cast/ws`.
- `api/auth.py`: add `/api/v1/cast/ws` to `PUBLIC_PATHS`.
- `music.py`: start and end a `source="cast"` track; hide seek and pause for it.
- `config.py`: `MUSIC_CAST_ENABLED`, `PORTAL_ORIGIN`.
- Tests: ticket single use and expiry, origin refusal, rate cut-off, buffer
  under-run returns silence, overflow drops oldest, cast end resumes the queue.

**Portal (`dnd_bot_dashboard`)**

- `lib/bot/allowlist.ts`: two rules (`cast/start`, `cast/stop`), strict empty bodies.
- `lib/bot/cast.ts` (new, client): capture, recorder, socket, reconnect once, stop.
- `components/bot/music/CastPanel.tsx` (new) and a "Live" state in `TransportBar.tsx`.
- `app/(portal)/dm/soundboard` and `app/(portal)/bot/music`: mount the panel.
- Demo twin (`lib/demo/botTransport.ts`): a fake cast that only flips state, so
  the demo shows the panel without capturing anything.
- `next.config.ts`: add `display-capture=(self)` to `Permissions-Policy`.
- `proxy.ts`: no change (`connect-src 'self'` already covers same-host `wss`).
- `scripts/mock-bot.mjs`, `tests/bot-contract.test.ts`, `tests/route-gates.test.ts`.
- `docs/security.md`: one new row (below).

**Deploy**

- `deploy/Caddyfile`: `handle /cast/ws { rewrite * /api/v1/cast/ws; reverse_proxy 127.0.0.1:8080 }`.
  Same in `nginx.conf` with the upgrade headers.

### Security row to add

> **A cast used to reach the bot without the portal, flood it, or feed ffmpeg
> a hostile file.** The socket is the one bot path Caddy exposes. It accepts
> only the portal's origin and a single-use 30-second ticket that the portal
> hands to a signed-in user holding `bot.music`; starting is audited and rate
> limited. The stream is capped in rate, size and length, decoded by ffmpeg
> from stdin as webm only with every other protocol off, and the feature is
> off unless `MUSIC_CAST_ENABLED=true`.

Known and accepted: ffmpeg parses bytes chosen by a signed-in, permitted user.
The same is already true for uploads.

## Phase 2: requests ("people direct")

A list where anyone with the Player permission can ask for something, and the
person holding the controls decides.

- Player page: **Request a song**: a YouTube or SoundCloud link (the existing
  strict forms) or free text ("tavern music"), 140 characters.
- DM sees a **Requests** card on the Sound page: play now, queue, or dismiss.
  A link plays through the existing resolver; free text is only a hint.
- Stored in the portal database (`music_requests`: id, campaign, user, kind,
  ref or text, created, status). Limits: 5 open per player, 50 per campaign,
  cleared after 24 hours.
- Routes under `/api/play/requests` (player) and `/api/dm/requests` (DM), with
  the same guards as notes.

No bot change. About a third of the size of phase 1.

## Order of work

| Step | What | Done when |
|---|---|---|
| 0 | Spike (throwaway): a bare HTML page that casts a tab to a local bot build | Sound from a YouTube tab is heard in a test voice channel with under 2 s delay, for 30 minutes without drift |
| 1 | Bot: `cast.py`, routes, tests, flag off | Bot tests pass; `cast/start` answers 404 while the flag is off |
| 2 | Portal: allowlist, client, panel, demo twin, mock bot, tests | `npm run verify` passes; the demo shows the panel |
| 3 | Deploy: proxy route, flag on, security doc | A cast works on the real server from Chrome and Edge |
| 4 | Phase 2: requests | A player request shows up for the DM within 10 s |

Deploy the bot before the portal (the portal needs the new endpoints). Do the
spike first: if delay or drift is bad in practice, the design changes (WebRTC
instead of a recorder over a socket) before anything real is written.

Before writing portal code, read the matching guides in
`node_modules/next/dist/docs/` as `AGENTS.md` requires.

## Option B in short, for comparison

A second container running a full browser with a virtual screen and a virtual
sound card (the open-source "neko" project is the usual base). The portal page
shows its picture over WebRTC; whoever holds the "controls" token drives it.
The bot reads the virtual sound card as an ffmpeg input.

What it needs beyond A: about 2 GB more memory and a second CPU; a new network
wall so that browser cannot reach `127.0.0.1:8080` or the portal's database; a
way to wipe its profile after each session; turn-taking for controls; and an
answer for the sign-in wall, because every site sees a data-centre visitor.
Roughly three to four times the work of A.

## Calls made here (change any of them)

- Recorder-over-WebSocket rather than WebRTC: far less code, one second of delay
  is fine for music. The spike checks this.
- A cast replaces the current track and the queue resumes after, rather than
  mixing as a layer.
- Permission is the existing `bot.music`; no new permission.
- The cast panel lives on the existing Sound and Music pages, not a new tool.
- The ticket travels as the first socket message, not in the URL.

## Open questions

1. **Which reading of "people can direct"?** One caster with hand-over plus a
   request list (this design), or everyone driving one shared browser (option B)?
2. **Is desktop Chrome or Edge only acceptable** for the person casting?
   Listeners are unaffected.
3. **Who may cast:** everyone with Music, or DM and co-DM only?
4. **How big is the VPS** (memory, CPUs)? Only matters if B is on the table.
5. **Should the caster hear the tab locally too**, or should the portal mute
   it for them (Chrome can do either) so they hear it only through Discord?

## Worth knowing

Sending a site's audio into a voice call is against the terms of some services
(YouTube and Spotify among them). The existing YouTube resolver is in the same
position. This is a private table, but it is the owner's call to make.
