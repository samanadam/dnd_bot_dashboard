# SoundCloud sets (albums and playlists)

Date: 2026-10-06
Repos: `dnd_bot` (bot API) and `dnd_bot_dashboard` (portal)

## Goal

Let the DM use a SoundCloud album or playlist at the table:

1. **Queue a whole set** as music: play now, play next or add to the end, in
   set order or shuffled.
2. **Browse a set**: list its tracks, then play one or save one as music,
   ambience or an effect, exactly like a single pasted track today.
3. **Save a set** in Saved links (music only) and use it as a Scene's music.

SoundCloud albums and playlists share one URL shape,
`https://soundcloud.com/<artist>/sets/<name>`, so one feature covers both.

Out of scope: YouTube playlists, private sets (`/sets/<name>/s-<token>`),
`on.soundcloud.com` short links, a set as an ambience or effect layer.

## Security stance

Playlists are refused on purpose today (`--no-playlist`, `NOT_A_TRACK`,
`docs/security.md`). That stays true for every existing path. Sets get their
own endpoints, their own strict link form, and every entry inside a set must
pass the existing single-track check before it is queued or returned. A set
link never reaches `music/play`, `soundboard/play` or `soundboard/prepare`.

## Bot (`dnd_bot`)

### Link rules (`net.py`)

- `SOUNDCLOUD_SET_LINK`: `^https://(?:www\.|m\.)?soundcloud\.com/(<slug>)/sets/(<slug>)/?$`,
  same slug class as tracks. Artist must not be in `SOUNDCLOUD_NOT_A_TRACK`.
  Set slug capped at 115 characters (keeps the stored reference within 241).
- `soundcloud_set_path(url) -> str | None`: `artist/sets/name`, lower case.
- `canonical_soundcloud_set_url(path) -> str`: `https://soundcloud.com/<path>`;
  raises `UnsafeUrl` for anything else.

### Resolver (`ytdlp.py`, `SoundCloudResolver`)

`async def set_entries(link, limit=50) -> SetListing` where
`SetListing = (title: str, tracks: list[Track], truncated: bool)`.

- Canonicalise with `canonical_soundcloud_set_url(soundcloud_set_path(link))`;
  refuse otherwise (`TrackResolutionError`).
- One extraction: base args plus `--yes-playlist --flat-playlist
  --playlist-end <limit+1>` (later flag wins over `--no-playlist`).
- Result must be `_type == "playlist"`; otherwise "That link is not a set."
- Each entry: take `url` (or `webpage_url`); keep it only if
  `soundcloud_track_path` accepts it. Id is the canonical track link, title
  from `sanitize_title(entry.title)` or the slug, duration if reported.
  Entries that fail are dropped and counted.
- Tracks carry `uri=""` and `expires_at=0.0`, so they are stale from the
  start and resolved by `_fresh` when their turn comes (existing mechanism).
- `truncated` is true when more than `limit` entries came back.
- Empty result after filtering: "That set has no playable tracks."

### Player (`music.py`)

- `play_many(guild_id, tracks, *, channel_id, position)`: one lock, one
  capacity check. Adds as many as fit (`music_max_queue - held`); none fit is
  a 409. `now`: halt current, start the first (via `_fresh`), the rest go to
  the front of the queue in order. `next`: all go to the front in order (start
  the first if idle). `end`: append (start the first if idle). Returns
  `(player, queued, dropped_for_capacity)`.
- **Dequeue robustness (applies to all tracks):** when `_fresh`/`_start`
  fails for the next track, log it and try the following one, up to 5 in a
  row, instead of stopping the queue. A removed track in a set must not end
  the music.

### API (`api/routes_music.py`)

- `POST /api/v1/music/set` body `{source: "soundcloud", id: <set link>}`
  → `200 {title, tracks: Track[], truncated, skipped}`. Read only.
- `POST /api/v1/music/play-set` body `{source: "soundcloud", id, position?,
  shuffle?, channel_id?}` → `202 {...player_state, queued, skipped}`.
  `shuffle` shuffles the listed tracks before queueing (`random.shuffle`).
- Both: source other than `soundcloud` is 400; source disabled is the
  existing disabled error. Both added to `TIGHT_LIMIT_PREFIXES` (they reach
  SoundCloud).
- Logged like `music/play`.

### Tests (`tests/`)

Link parser (accept / refuse table incl. private token, `/sets` alone,
reserved artist, long slug), `set_entries` with a fake runner (filters bad
entries, truncation, non-playlist refusal, empty set), `play_many` (each
position, capacity, shuffle keeps the same set of tracks), dequeue skip-on-
failure, both routes (happy path, bad source, bad link, disabled).

## Portal (`dnd_bot_dashboard`)

### Link rules (`lib/soundcloud.ts`, `lib/webAudio.ts`)

- `SC_SET_REF` `^[a-z0-9_-]{1,120}/sets/[a-z0-9_-]{1,115}$`,
  `isSoundCloudSetRef`, `soundcloudSetUrl(ref)`, `SOUNDCLOUD_SET_LINK`, and
  `parseSoundCloudSetLink(input)` (same host, port, credential rules as
  tracks; `segments.length === 3 && segments[1] === "sets"`).
- `isSoundCloudRef` keeps refusing sets. New helpers in `webAudio.ts`:
  `isSetRef(source, ref)` (SoundCloud only), `isRef(source, ref, kind?)`
  accepts a set reference only when `kind === "music"`, `trackUrl` builds
  the set link for a set reference, `detectLink` returns
  `{source, ref, set: true}` for a set link.

### Proxy allowlist (`lib/bot/allowlist.ts`)

- `POST music/set`: bucket `control`, timeout 30s, body
  `{source: literal "soundcloud", id}` where `id` must match
  `SOUNDCLOUD_SET_LINK` exactly.
- `POST music/play-set`: bucket `control`, timeout 30s, audit, body
  `{source, id, position?, shuffle?: boolean, channel_id?}` with the same
  link check.
- The soundboard rules are unchanged: `isTrackLink` refuses a set link.
  `music/play` gains a refine that refuses an `id` matching
  `SOUNDCLOUD_SET_LINK` (the bot refuses it too, as a playlist), so sets have
  exactly one way in.

### Client and types (`lib/bot/client.ts`, `lib/bot/types.ts`)

`bot.setTracks(id)` → `SetListing {title, tracks, truncated, skipped}`;
`bot.playSet({id, position, shuffle, channel_id})` → `PlayerState & {queued,
skipped}`. Demo transport and `scripts/mock-bot.mjs` gain both endpoints.

### Saved links (`lib/dm/saved.ts`)

A set is stored as `source: "soundcloud"`, `kind: "music"`,
`ref: "artist/sets/name"`. The schema refine uses `isRef(source, ref, kind)`,
so a set saved as ambience or an effect is refused. No migration: the
existing DB check (`length(ref) BETWEEN 3 AND 241`) already fits.

### Scenes (`lib/dm/scenes.ts`)

`music` gains `shuffle: boolean` (optional, default false, older scenes
unaffected). A music `id` that matches `SOUNDCLOUD_SET_LINK` is a set; the
schema allows it only with `source: "soundcloud"`. Running a scene calls
`bot.playSet({position: "now", shuffle})` for a set, `bot.play` otherwise;
the scene's music volume applies as today.

### UI

- **Saved links** (`components/dm/SavedLinks.tsx`), Music tab: pasting a set
  link shows a "Set" result card with title, track count and two actions:
  **Save set** and **Show tracks**. Show tracks lists the set's tracks as
  ordinary results (save/play as today, any kind). On the Ambience and
  Effects tabs a pasted set goes straight to its track list. A saved set row
  shows a "Set" badge and Play now / Play next / Add to queue plus a Shuffle
  toggle (remembered per browser via `useLocalValue`).
- **Music page web search** (`components/bot/music/WebSearch.tsx`, SoundCloud
  card): a pasted set link shows the same set card: **Queue set**
  (with shuffle) and **Show tracks**.
- **Scenes editor**: saved sets appear in the Music picker's "Saved links"
  group, marked "(set)", with a Shuffle checkbox when a set is chosen.
- Toasts: "Queued 23 tracks from <set>" plus "(5 skipped)" when any were
  dropped.

### Docs

`docs/security.md` row for saved links updated: sets accepted only through
the two set endpoints, entries re-checked one by one.

### Tests (`tests/`)

Set link parsing and refusal table; `isRef` kind rule; saved schema accepts a
music set and refuses an ambience/effect set; scene schema with set music and
shuffle, older scenes still parse; allowlist accepts the exact set link and
refuses a track link, a private set and a set on `music/play` /
`soundboard/play`; demo transport answers both endpoints.

## Error handling summary

| Case | Result |
| --- | --- |
| Private set / short link / non-set | Portal refuses before the call; bot refuses again |
| Set with unplayable entries | Dropped, counted in `skipped` |
| Set empty after filtering | 409 "That set has no playable tracks." |
| Queue nearly full | Queue what fits, report the rest as skipped; none fit is 409 |
| Track in a queued set removed later | Dequeue skips it, playback continues |
| SoundCloud off on the bot | Existing disabled error; UI disables actions |

## Rollout

Bot first (new endpoints are additive), then the portal. A portal deployed
before the bot gets a 404 from the bot on the set endpoints and shows the
bot's message; nothing else changes.
