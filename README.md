# Portal

A web control room for the D&D recorder bot, built to host more tools later.
Sign in with Discord, see what the bot is doing, and drive recording and music
from a laptop or a phone at the table.

- **Live status**: follows the bot on its own. It turns active within seconds
  when the bot joins a voice channel or starts recording, including from a slash
  command in Discord, and the controls use the channel the bot is in.
- **Overview**: bot health, disk, storage, pending transcripts, live recordings
  with stop / cancel, start a recording, recent sessions.
- **Music**: library, YouTube and SoundCloud search (when the bot enables them), queue editing,
  transport with a seek bar, volume, loop, join / leave voice. The DM can also upload tracks
  (drag and drop, with progress) and delete them.
- **Sessions**: full history, recovery of interrupted sessions, and the
  transcript of a finished session with per-speaker filtering, search and
  download.
- **Search**: find what was said across every transcript, filtered by
  campaign, and open the transcript at that line.
- **Campaigns**: keep several games on one Discord server apart. Each has its
  own voice channel, character names, a list of names the transcriber should
  expect, and "heard, should read" fixes. Sessions, NPCs, encounters and scenes
  follow the campaign picked in the switcher. A session recorded with no
  campaign can be filed later, even after it is transcribed.
- **Settings**: 12 themes, per-device defaults, account and connection info.
- **DM Screen** (only for ids in `DM_USER_IDS`):
  - **Bestiary**: all SRD 5.1 and 5.2 monsters plus your own, with full stat
    blocks where every bonus and damage roll is one click.
  - **NPCs**: your campaign's people with stat blocks, private notes and tags.
  - **Combat**: initiative tracker with turns, rounds, hit points, temporary hit
    points, timed conditions and concentration; autosaves.
  - **Dice**: cryptographically random rolls with advantage, keep/drop and an
    optional "Send to Discord" through the bot.
  - **Sound**: music, looping ambience and one-shot effects on one page, mixed
    in voice, with **scenes**: saved combinations (music plus sounds, with
    volumes) in categories, played with one tap.
  - **YouTube and SoundCloud library**: paste a link or search, then save it as music, an
    ambience loop or an effect, with any tags you like and, if you
    like, a campaign. Music plays now, next or at the end of the queue; ambience
    toggles as a loop; effects fire once. The bot saves each ambience or effect
    the first time so it starts at once afterwards ("Get all ready" does it
    ahead of the game). Saved sounds can be added to scenes. Needs the bot's
    link resolver turned on (`MUSIC_YTDLP_ENABLED`); SoundCloud works from
    a server where YouTube asks for a sign-in.
  - **Prepared encounters**: build a fight ahead of time, with allies, and launch
    a fresh copy at full hit points when it starts.
  - **Player rolls**: players report their initiative in Discord with `/init`;
    you apply each total in the tracker (typing it in by hand still works).
  - **Dice picker**: tap dice and a bonus to build the roll, then roll.
  - **Soundboard**: looping ambience and one-shot effects mixed over the music
    in voice, with live per-sound volume; also a panel inside an encounter.
  - **Sound tags**: put as many tags as you like on any sound (a track, an
    ambience loop, an effect or a saved link), change them at any time, and
    filter the music library, the soundboard and saved links by them. Tags
    live in the portal's database, so the bot needs nothing new.

The security model is in [docs/security.md](docs/security.md). Read it before
changing anything under `app/api`, `auth.ts`, `proxy.ts` or `lib/bot/allowlist.ts`.

## How it fits together

```
browser ──session cookie──> portal (Next.js) ──Bearer BOT_API_TOKEN──> bot API
                            checks the session,
                            allowlists the call,
                            validates the input
```

The bot token never reaches the browser. The browser only talks to the portal's
own `/api/bot/*`, the single place the token is read.

## Run it locally

Requirements: Node 22+.

```bash
npm install
cp .env.example .env.local     # fill in the values
npm run dev
```

No bot handy? Run the mock bot, which implements the whole API contract in
memory:

```bash
# in .env.local: BOT_API_URL=http://127.0.0.1:8787/api/v1 and any BOT_API_TOKEN
npm run mock-bot
```

You still need a Discord application to sign in.

### Discord application

1. Create an application at <https://discord.com/developers/applications>.
2. OAuth2: copy the client id and secret into `AUTH_DISCORD_ID` and
   `AUTH_DISCORD_SECRET`.
3. Add the redirect `http://localhost:3000/api/auth/callback/discord`, plus the
   same path on your production URL.
4. Turn on Developer Mode in Discord, then copy the server id into
   `ALLOWED_GUILD_ID` and the admin role id(s) into `ALLOWED_ROLE_IDS`.

The portal asks only for `identify` and `guilds.members.read`. It needs no bot
token of its own and never sees anyone's email.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` then `node .next/standalone/server.js` | Production build and server |
| `npm test` | Unit tests: proxy pipeline, allowlist, access checks |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run verify` | All of the above, a build, then a scan of the client bundle for secrets |
| `npm run mock-bot` | In-memory bot API for development |
| `npm run docker:up` | Build and start the hardened container (`docker compose up -d --build`) |
| `npm run docker:mock` | Same, against the mock bot |
| `npm run docker:host` | Start with host networking, for a bot on the VPS's loopback |

## Deploy

Production runs at **https://dashboard.example.com** as containers on the VPS:
the portal plus a Caddy container for HTTPS. Full guide:
[docs/deploy.md](docs/deploy.md). Short version, on the VPS:

```bash
cp .env.example .env && chmod 600 .env   # fill in
docker compose up -d                     # COMPOSE_FILE in .env picks the stack
```

## Adding a tool

1. Add an entry to `lib/tools/registry.ts`.
2. Put its pages under `app/(portal)/<tool>/`. The portal layout already
   requires a signed-in, role-checked user; still call `requireUser()` in each page.
3. If it calls a backend with a secret, give it its own route handler under
   `app/api/<tool>/` with its own allowlist, modelled on `lib/bot/proxy.ts`.
   Never widen the bot allowlist for another tool, and never share tokens.

## Credits

The bestiary bundles monsters from the System Reference Documents 5.1 and 5.2
by Wizards of the Coast LLC, licensed under CC-BY-4.0. See
[data/srd/NOTICE.md](data/srd/NOTICE.md).
