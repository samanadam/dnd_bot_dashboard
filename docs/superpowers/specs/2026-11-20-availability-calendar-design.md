# Availability calendar + Telegram nudge

## Intent

The group has no easy way to settle a session day. Players mark the days they
can play in the portal. When every player is free on the same date, the portal
sends the DM a Telegram message with that date and a one-tap "Share to
WhatsApp" button, and the DM posts it to the WhatsApp group. Everything is free.

## Goals

- Players mark free days on a date grid; everyone sees the counts, the DM sees who.
- First time a date becomes free for every player, the DM gets one Telegram
  message with ready-to-post text and a button that opens WhatsApp prefilled
  (`https://wa.me/?text=...`), where the DM picks the group.
- v1 is one campaign and one group, but the schema carries a `campaign_id` so
  more campaigns are rows later, not a rewrite.

## Non-goals

- No automatic WhatsApp posting (no spare SIM; an unofficial client risks a ban;
  the official API cannot post to an existing group).
- No retraction message when someone un-ticks a date.
- No Google Calendar sync, no reminders, no time-of-day slots (v1 is whole days).
- No per-campaign membership from the bot (its API carries no Discord ids).

## Anti-goals

- A failed Telegram call must never fail or slow a player's save.
- The same date must never be announced twice, even on a double save.
- The DM must never be blocked by a non-player (observer, DM not playing).

## Constraints

- Portal SQLite, append-only `MIGRATIONS` in `lib/dm/db.ts`. Env vars are
  validated in `lib/env.ts` (zod). Routes follow the `routeDeps` pattern; player
  pages live under `app/(portal)/play`, DM settings under `settings`.
- Next.js 16: read `node_modules/next/dist/docs/` before writing routes/pages.
- Telegram is called from the server only (VPS), `https://api.telegram.org`.
  The bot token never reaches the browser. Telegram on the DM's phone is the one
  client requirement.
- Auth: players sign in by Discord or by the code sign-in design
  (`2026-11-19-totp-signin-design.md`); both give a normal session, so no change.

## Approaches considered

1. **Date grid, free/not free, 8 weeks (chosen).** Fits "set this date".
2. Weekly recurring grid. Rejected: trigger is about a specific date.
3. DM proposes dates, players vote. Rejected: DM must do work first.

Notification: **Telegram bot to the DM (chosen)** vs Baileys to the group
(rejected: needs a spare SIM, ToS risk) vs official WhatsApp API (rejected: cannot
post to an existing group, paid templates).

## Design

**Tables (new migration).**
- `availability(campaign_id, user_id, day TEXT 'YYYY-MM-DD', PRIMARY KEY(campaign_id, user_id, day))`: a row means free.
- `campaign_players(campaign_id, user_id, PRIMARY KEY(...))`: who counts as "everyone". v1 uses `campaign_id = 'default'`.
- `announced_days(campaign_id, day, announced_at, PRIMARY KEY(campaign_id, day))`: the dedupe lock.

**Player page `/play/availability`.** 8-week grid starting today; tap to toggle
your free days (PUT the set of days, server validates dates in range). Each day
shows "n / total free". DM view adds names. Past days are read-only.

**DM settings `/settings/availability`.** Tick which portal users are players
(from `portal_users`), and a "Send test message" button for Telegram.

**Trigger.** After a successful save, in the same request but after the DB
write: find days where every player in `campaign_players` is free and no
`announced_days` row exists. For each, `INSERT` into `announced_days` first (the
lock; a conflict means someone else already announced it), then send one
Telegram message listing up to 3 earliest new days. Needs at least 2 players,
and only future days count. A thrown or non-2xx Telegram call is caught,
logged via `lib/audit`, and surfaced as a warning in the DM settings page.

**Telegram message.** `Everyone is free on <Sat 29 Nov>. Session day set?` plus
an inline button `Share to WhatsApp` with URL
`https://wa.me/?text=<encoded "Session day set to Sat 29 Nov">`. The text is
built server-side from a fixed template, no user input in it.

**Config.** Env `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`, both optional; if
missing the calendar still works and the trigger is a logged no-op. Setup (README
note): create a bot with BotFather, send it `/start`, read the chat id once from
`getUpdates`.

## Decisions (builder follows these)

- Whole days, 8 weeks ahead, server date in the group's timezone (`Europe/Istanbul`).
- Message once per date ever; un-ticking later does nothing.
- "Everyone" is the DM-ticked player list, not all portal users.
- Telegram via plain `fetch` with a 5s timeout. No new dependency.

## Left to the builder

Grid component styling (reuse existing theme components), route file layout,
tests (vitest): unanimity logic, dedupe on double save, fewer than 2 players,
past days ignored, Telegram failure does not fail the save, message text escaping.
