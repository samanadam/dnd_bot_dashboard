# Security model

The bot API has one static token that can do anything, including deleting a
live recording. Everything here exists to keep that token on the server and to
make sure only the right people can make the portal use it.

## Threats and defences

| Threat | Defence | Where |
|---|---|---|
| Token leaks to the browser | Read only in the `/api/bot` route handler; server-only env; no `NEXT_PUBLIC_` values; `npm run verify` scans the client bundle | `app/api/bot/[...path]/route.ts`, `lib/env.ts`, `scripts/verify-bundle.mjs` |
| Stranger signs in | Discord OAuth; must be in `ALLOWED_GUILD_ID` with a role in `ALLOWED_ROLE_IDS`. No read-only tier | `auth.ts`, `lib/discordAccess.ts` |
| Admin loses the role but keeps a session | Role re-checked against Discord every 5 minutes. A denial ends the session; if Discord cannot be reached for 30 minutes the session fails closed. Sessions last at most 12 hours | `lib/discordAccess.ts` (`reverify`) |
| Session theft | Auth.js encrypted (JWE) cookie keyed by `AUTH_SECRET`; `HttpOnly`, `SameSite=Lax`, `Secure` with the `__Secure-` prefix over HTTPS. The Discord access token lives only inside the encrypted cookie; the session sent to the client has id, name and avatar only | `auth.ts` |
| CSRF against bot actions | Every `/api/bot` call must carry `x-portal-request: 1` (forces a CORS preflight that is never granted) and be same-origin by `Sec-Fetch-Site`, or `Origin` vs `Host` on older browsers. Sign-in and sign-out are server actions, which Next checks for origin | `lib/bot/proxy.ts` |
| Reaching unintended bot endpoints | Exhaustive method + path allowlist. Segments must match `[a-z0-9_-]`; traversal and encoded separators are refused; the upstream path is rebuilt from validated segments | `lib/bot/allowlist.ts` |
| Smuggling fields into bot calls | Strict zod schema per route for query and body; unknown keys rejected; only the re-serialised, validated object is forwarded; Discord ids must be snowflakes | `lib/bot/allowlist.ts` |
| Abuse, or burning the shared token's rate limit | Reads are shared across all users for 2 seconds (single-flight), so the bot sees roughly 30 requests a minute however many tabs are open; the session is still checked before a cached answer is served, and any successful change clears the cache. Per-user limits: 120 reads, 60 controls, 10 recording actions per minute. Bodies capped at 8 KB, responses at 2 MB; upstream timeouts 10 s (30 s for music resolution); redirects from the bot refused | `lib/bot/proxy.ts` |
| XSS | React escaping, no `dangerouslySetInnerHTML`; nonce CSP with `strict-dynamic`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'` | `proxy.ts` |
| Clickjacking, sniffing, referrer leaks | `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`, COOP/CORP, restrictive `Permissions-Policy`, HSTS in production | `next.config.ts` |
| Open redirect after sign-in | `callbackUrl` must be a same-origin relative path; Auth.js also refuses foreign origins | `lib/session.ts` |
| Bad bot token mistaken for a signed-out user | A bot `401` becomes `502 bot_auth_failed` | `lib/bot/proxy.ts` |
| Leaky errors | Bot errors normalised to `{error:{code,message}}`; non-JSON bodies never passed through; the error page never renders `error.message` | `lib/bot/proxy.ts`, `app/(portal)/error.tsx` |
| No accountability with a shared token | Structured audit log on stdout: sign-ins (allowed and refused), revocations, recording and play actions, refused or failed bot calls, each with the Discord user id. Tokens, cookies and bodies are never logged | `lib/audit.ts` |
| Misconfiguration | Env validated on first use; plain HTTP to the bot only on loopback or an explicitly listed container name; short tokens and secrets refused; health check reports `misconfigured` without details | `lib/env.ts`, `app/api/health/route.ts` |
| Tampered theme cookie | Only known theme ids are accepted; CSS values come from the built-in table, never from the cookie | `lib/theme.ts` |
| Container compromise | Non-root user, read-only filesystem, all capabilities dropped, `no-new-privileges`, memory and process limits, port bound to loopback; no secrets in the image or build context | `Dockerfile`, `docker-compose.yml`, `.dockerignore` |
| Edge proxy abuse | Caddy terminates TLS with automatic certificates, strips client-supplied `X-Forwarded-*`, caps request bodies at 64 KB, hides `/api/health`, answers unknown hostnames with nothing, and runs read-only with only `NET_BIND_SERVICE` | `deploy/Caddyfile`, `compose.caddy.yml` |
| Another portal admin opens DM data | `DM_USER_IDS` allowlist checked before anything else; pages and API answer 404, so the DM tools do not reveal they exist. Empty list means nobody | `lib/dm/guard.ts`, `lib/dm/access.ts` |
| Malicious stat block or note text (XSS) | Stored and rendered as text only; React escapes it; no `dangerouslySetInnerHTML`; zod length caps on every field; nonce CSP | `lib/dm/statblock.ts`, `components/dm/*` |
| SQL injection | Only prepared statements with parameters; ids validated before any query; rows re-validated with zod on read | `lib/dm/creatures.ts`, `lib/dm/encounters.ts` |
| DM data loss | Named Docker volume (`portal_data`), WAL mode, daily off-site copy to R2 through the bot container | `docker-compose.yml`, `deploy/backup-portal-db.sh` |
| Someone uploads a web shell or a huge file as "music" | Uploads are DM-only and rate-limited (6/min). The portal checks the folder, extension and declared size, and cuts a body off past its Content-Length. The bot rebuilds the file name, refuses anything whose first bytes do not match the extension, needs ffprobe to find real audio, refuses to overwrite, runs one upload at a time and stops when the disk is tight | `lib/bot/upload.ts`, `dnd_bot/uploads.py` |
| A track id aimed at another part of the bucket (`outbox/…`) | Playing, layering and deleting all check the id against a live listing of the exact folder, so only listed audio files under the music prefix can be named | `dnd_bot/tracks.py`, `dnd_bot/uploads.py` |
| A transcript leaking Discord user ids or server paths | The API builds each segment field by field (speaker label, times, text) and drops the JSON's `user_id`; warnings are path-redacted | `dnd_bot/transcripts.py`, `dnd_bot/api/middleware.py` |
| Soundboard traffic drowning the bot's rate limit | Soundboard state polls only while the board is on screen, reads are shared for two seconds across users, and uploads sit in the bot's tight 10/min bucket | `components/dm/SoundboardDrawer.tsx`, `lib/bot/proxy.ts`, `dnd_bot/api/auth.py` |
| A non-DM changes how sessions are filed, transcribed or read | Campaign writes, filing a session, the transcription sync and the initiative calls are `dmOnly` in the allowlist, so anyone else gets the same 404 as an unknown URL. Campaign ids must match `^[a-f0-9]{12}$` before they reach a path, a query or a SQL parameter | `lib/bot/allowlist.ts`, `lib/campaign/selection.ts` |
| A crafted transcript search or glossary | The search box reaches the bot only as words: FTS operators, quotes and `*` are stripped and each word is quoted. Glossary lists are size-capped per rule and validated `.strict()`; corrections are whole-word literals, never patterns | `dnd_bot/search.py`, `dnd_bot/campaigns.py`, `lib/bot/allowlist.ts` |
| A campaign filter used to reach another campaign or inject SQL | The picked campaign (cookie and localStorage) holds only a validated id or `unassigned`; anything else means all. It is a display filter, not a permission, and is always a bound SQL parameter | `lib/campaign/selection.ts`, `lib/dm/*` |
| A session is deleted or renamed by the wrong person, by mistake, or to reach files outside it | Renaming, moving to the trash, restoring and purging are `dmOnly` and audited, and the trash list is hidden from everyone else. Deleting is two steps: the trash only hides a session and keeps every file, and purging works only on a session already in the trash and after the DM types `delete`. Every call must repeat the session id in its body. The bot refuses while the session is recording or the transcriber holds it, removes files before the database row so a failure can be retried, only deletes folders directly under its own data directories (never following a symlink), rate limits purging like recording controls, and empties the trash on its own after `TRASH_RETENTION_DAYS`. The transcriber's own archive is not reachable and is left alone | `lib/bot/allowlist.ts`, `dnd_bot/api/routes_sessions.py`, `dnd_bot/session_admin.py` |
| A stored scene smuggling a path into a later bot call | Track ids use the allowlist rule (no control characters) and the bot re-checks each id against a live listing of its folder; scenes are played as ordinary allowlisted, rate-limited calls | `lib/dm/scenes.ts`, `dnd_bot/tracks.py` |
| A saved YouTube or SoundCloud link carrying a host, path, playlist, query string or option flag into yt-dlp | Only a reference is stored: the 11-character video id, or the lower-case `artist/track` path (one strict pattern per service, checked on write, on read and again in the database), and every link sent to the bot is rebuilt from it as `https://www.youtube.com/watch?v=<id>` or `https://soundcloud.com/<artist>/<track>`. Sets, profiles and private-link tokens do not match. The proxy accepts nothing else for these sounds, and the bot re-checks the host allowlist for that service, refuses playlists and live streams, requires the extractor to report the track the link names, and names the download file from the id (YouTube) or a hash of the path (SoundCloud) | `lib/youtube.ts`, `lib/soundcloud.ts`, `lib/webAudio.ts`, `lib/dm/saved.ts`, `lib/bot/allowlist.ts`, `dnd_bot/ytdlp.py`, `dnd_bot/net.py` |
| A YouTube or SoundCloud sound filling the disk the recording needs, or playing a stream that expires mid-loop | Sounds are downloaded once into the music cache (never streamed): effects up to 60 s, ambience up to 30 min, 40 MB per file, all set on the bot. The size and length are checked before and after (ffprobe must find audio), the free-space guard and cache cap apply, a download that overruns is killed and its partial files removed, and layers only accept a file inside the cache | `dnd_bot/ytdlp.py`, `dnd_bot/music.py`, `dnd_bot/musiccache.py` |
| A non-DM saves, plays or downloads web sounds | The saved-link routes use the DM guard, and `soundboard/play` and `soundboard/prepare` are `dmOnly`, audited and rate limited, so anyone else gets the 404 an unknown URL gets | `lib/dm/savedRoutes.ts`, `lib/bot/allowlist.ts` |
| A tag used to carry markup, a path or SQL, or to tag something that is not a sound | A tag is at most 32 characters with no control, direction-override or comma characters, a sound has at most 12, and at most 5000 sounds carry tags. What is tagged is named by a `bucket:<key>` or `saved:<uuid>` ref checked on write, tags are only ever bound parameters, shown as text, and re-validated on read. The routes use the DM guard, so anyone else gets the unknown-URL 404, and writes are audited without their contents | `lib/dm/tags.ts`, `lib/dm/tagRoutes.ts`, `components/dm/Tags.tsx` |
| A video title that lies about what it is | Titles are rejected on save if they hold control or direction-override characters, shown only as text, and the link opens with `rel="noopener noreferrer"` | `lib/dm/saved.ts`, `components/dm/SavedLinks.tsx` |
| Someone floods the DM tracker with fake initiative | `/init` accepts only a total from -20 to 60 and a cleaned 40-character name, 2 seconds apart per player, at most 60 pending and 12 hours old; the DM applies every total by hand and a name that matches two combatants is never applied automatically | `dnd_bot/initiative.py`, `lib/dm/initiativeReports.ts` |
| Unlicensed book content in the public repo | Only SRD 5.1/5.2 (CC-BY-4.0) is bundled, with attribution; the import script refuses other Open5e documents. Book monsters live only in the server database | `scripts/import-srd.mts`, `data/srd/NOTICE.md` |

## Layers of the auth check

1. `proxy.ts` redirects signed-out page requests to `/signin`.
2. The portal layout and every page call `requireUser()` on the server.
3. `/api/bot/*` checks the session itself before anything else.

Each layer stops an anonymous request on its own.

## Known limits

- Rate limits and the role-check cache live in process memory. Run a single
  instance, or move them to a shared store before scaling out.
- Every portal user acts as the same bot token; the bot cannot tell them apart.
  The audit log is the record of who did what.
- Signing out clears the cookie and revokes the Discord grant. A copied cookie
  then fails its next role check (within 5 minutes) instead of lasting until it
  expires. Rotate `AUTH_SECRET` to end every session at once.

## Checklist before deploying

- [ ] `AUTH_SECRET` is freshly generated and used for nothing else.
- [ ] The portal is served over HTTPS only.
- [ ] `BOT_API_URL` is loopback or HTTPS, and the bot API is not public unless it has to be.
- [ ] `API_CORS_ORIGINS` on the bot is empty.
- [ ] CI is green for the commit being deployed (it runs `npm run verify` and `npm audit`).
- [ ] `.env` on the VPS is mode 600 and not in git.
- [ ] `docker compose ps` shows the portal as healthy, and port 3000 is not reachable from outside the VPS.
- [ ] Signed out, every page redirects and `/api/bot/stats` returns 401.
- [ ] A guild member without the role is refused at sign-in.
