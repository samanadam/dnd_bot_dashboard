# Code sign-in (TOTP) without Discord on every device

## Intent

Discord is blocked in Turkey, so players need a VPN or DNS change on every
device and every sign-in. Goal: a player signs in once with Discord (one VPN
use, or never, see Enrollment), links an authenticator app, and from then on
signs in on any device by picking their card and typing the 6-digit code.
Discord is never contacted from the player's browser again.

## Goals

- A third sign-in path: "Sign in with a code", next to the Discord button.
- Card list of players who enabled it. Pick a card, type the code, done.
- Works with iPhone Passwords, Google Authenticator, any TOTP app. No cost, no
  third-party account.
- A code session is an ordinary session: every existing page and API route
  (`auth()`, `requireUser`, grants, `/api/bot`, `/api/dm`) works unchanged.

## Non-goals

- No TOTP prompt after Discord login. Discord login stays exactly as it is.
- No passkeys, PIN, SMS or email. (Passkeys can be added later as a second path.)
- No live Discord role re-check for code sessions (see Decisions).

## Anti-goals (failure even if it "works")

- A code session that bypasses grants: someone with no access gets in.
- A stranger on the open sign-in page locking a player out for good.
- A TOTP secret readable from a DB backup.

## Constraints

- Auth.js v5, JWT sessions, 12h max age (`auth.ts`). Next.js 16: read
  `node_modules/next/dist/docs/` before writing routes or pages (AGENTS.md).
- Storage: the portal SQLite (`getDatabase()`, `portal_users` in
  `lib/access/grants.ts`). Rate limiter in `lib/rateLimit.ts` is in memory only.
- `proxy.ts` skips `/api/*`; route handlers do their own session check.
- CSP: `img-src 'self' data:` already allows a QR data URI.

## Approaches considered

1. **Card list + TOTP code only (chosen).** Simplest, matches the goal. The code
   is the only secret, so it needs lockout and replay protection.
2. Card list + passkey, TOTP fallback. Stronger but a new device needs the
   passkey synced; rejected for now, possible add-on.
3. Card list + PIN + TOTP. Two real factors, one more thing to remember; rejected.

## Design

**Enrollment (`/settings/security`, signed-in users only).** Generate a secret,
show QR (`otpauth://totp/Portal:<name>?issuer=Portal`) and the text secret, ask
for one correct code, then save. Disable button removes it. v1 needs one Discord
sign-in per player (one VPN use). A DM-created one-time enrollment link that
avoids even that is a later add-on.

**Storage.** Table `totp_credentials(user_id PK, secret_enc, last_counter,
enabled, created_at)` and `totp_attempts(user_id PK, fails, locked_until)`.
Secret is AES-256-GCM encrypted, key derived from `AUTH_SECRET` (HKDF).

**Sign-in (`/signin/code`).** Lists cards (avatar + name from `portal_users`)
for users with `enabled = 1`. Pick one, enter code, submit to an Auth.js
Credentials provider `totp`. `authorize` checks, in order: card enabled, not
locked (see below), code valid for the window (+-1 step) and its counter greater
than `last_counter`, stored roles still pass `hasAnyAccess(accessFor(...))`.
On success it updates `last_counter`, clears `fails`, and returns the user.

**Session.** `auth.ts` gets: `signIn` callback allows provider `totp`; `jwt`
callback has a branch for it that sets `discordId`, `roleIds` (from
`portal_users`), `verifiedAt`, `method: "totp"`, no `discordAccessToken`, and
calls `rememberRoles`. On later calls that branch re-reads roles and grants from
the DB (cheap, no Discord) and returns null when the card was disabled or access
is gone. Discord tokens keep the existing flow.

**Hardening.**
- 5 wrong codes lock that card for 15 minutes, in SQLite so a restart does not
  reset it.
- A signed device cookie (`HMAC(userId)`, 90 days, set after a successful code
  sign-in) skips the lockout for that user on that device, so a stranger cannot
  lock out the owner's own devices.
- Per-IP limit via `RateLimiter` (e.g. 20 attempts / 15 min) across all cards.
- Same error text for every failure. Audit events via `lib/audit`:
  `totp_sign_in` allowed / bad_code / locked / disabled.

## Decisions (builder follows these)

- Roles for code sessions come from `portal_users.role_ids`, refreshed on every
  Discord sign-in. Removing someone from the guild is NOT detected automatically;
  the DM disables the card (a "Code sign-in" toggle per user in `/settings/access`).
  Upgrade path: store each user's Discord refresh token server-side and re-check.
- Code sessions use the same 12h max age as Discord sessions.
- No recovery codes: lost phone means one Discord sign-in, then re-enroll.
- Deps: `otpauth` (codes) and one small QR library. Both free.

## Left to the builder

Exact UI of the card list and settings page (follow existing theme components),
file layout under `lib/totp/`, test cases (vitest): code window, replay, lockout,
disabled card, access removed, device cookie bypass, secret encrypt round-trip.
