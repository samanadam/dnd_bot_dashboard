# Availability calendar polish

Follows `2026-11-20-availability-calendar-design.md`. The calendar worked but was
hard to read before the group's first use.

## Problems

- The 56-day grid had no month names, so "30" followed by "1" was ambiguous.
- No marker for today, no legend, a `0/3` count on every day, no summary of the
  best dates, and no way to see who is free on a phone (names were a hover tooltip
  for the owner only).
- Your own days and days everyone can do looked alike.

## Design

- **Month blocks** with a heading each, padded so days sit under their weekday;
  today has a dot; past days fade.
- **Heat:** each day's background mixes the theme's `--ok` colour into `--surface-2`
  in proportion to the players free (capped at 38% so the number stays readable).
  Quiet days show no count. Your own days: accent border and check. A day everyone
  can do: `--ok` border and an "All" label.
- **Theme sync:** only theme variables and token classes are used, never a literal
  colour, so every theme (including the light ones) restyles it. A test asserts this.
- **Best days card:** top three upcoming days by players free, earliest on ties,
  each with who is missing. Beside the grid on desktop, above it on a phone.
- **Tap a day:** toggles your answer and selects it; a panel names who is free and
  who is not. On a phone the panel is pinned above the bottom nav while a day is
  selected. Tapping a weekday header ticks or unticks every upcoming one.
- **Saving:** taps within 500 ms merge into one save; a "Saving... / Saved" label;
  unconfirmed taps win over a refresh; counts refresh every 30 s and on focus;
  leaving the page sends the last tap.
- **Names for everyone:** `who` (names of listed players free per day) is returned
  to every player, not only the owner, because "who is missing" is the useful part.

## Non-goals

Times of day, a confirmed session date, DM approval, per-campaign calendars.

## Checked

Pure logic and components have unit tests. Looked at in a browser against a scratch
database on Arcane (dark), Daylight (light) and Ember at phone width.
