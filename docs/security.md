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
