# Portal

A web control room for the D&D recorder bot, built to host more tools later.
Sign in with Discord, see what the bot is doing, and drive recording and music
from a laptop or a phone at the table.

- **Live status**: follows the bot on its own. It turns active within seconds
  when the bot joins a voice channel or starts recording, including from a slash
  command in Discord, and the controls use the channel the bot is in.
- **Overview**: bot health, disk, storage, pending transcripts, live recordings
  with stop / cancel, start a recording, recent sessions.
- **Music**: library, YouTube search (when the bot enables it), queue editing,
  transport, volume, loop, join / leave voice.
- **Sessions**: full history, recovery of interrupted sessions.
- **Settings**: 12 themes, per-device defaults, account and connection info.

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
