# 04 Combat link and player battle page

Date: 2026-10-06
Repos: `dnd_bot_dashboard` (portal), `dnd_bot` (`/init`, turn pings, channel list)
Part of: [Players, spells and role permissions](2026-10-06-players-and-spells-overview.md)
Needs: [02 Roles and permissions](2026-10-06-02-roles-permissions-design.md), [03 Character sheets](2026-10-06-03-character-sheets-design.md)

## Goal

1. **The DM tracker uses sheets.** The DM adds a character from its sheet, and
   AC, max HP and initiative bonus come from the sheet. Damage, healing, temp
   HP, conditions and concentration done in combat change the sheet, and the
   player's own changes show in the tracker within seconds.
2. **Players get a battle page.** It shows initiative order and whose turn it
   is, health in bands, and aliases instead of monster names, plus the
   player's notes. It never shows AC, HP numbers, stats or real names the DM
   has not revealed.
3. **The bot joins in.** `/init` lands on the player's own combatant, and
   `/init` without a number rolls with the sheet's bonus. When a turn starts,
   the bot pings that player in Discord (opt-in per campaign).

## Security stance

Players and the DM read the same encounter, but players only ever get a
**projection built on the server** (`toPlayerView`). It works from an allowlist:
it copies only the fields it names. Hidden fields are never sent to a player,
not even blanked; the browser never receives anything it would have to hide. A
test serialises the projection of a fully loaded encounter and fails if any
forbidden value appears anywhere in the JSON (see Testing).

A player can open a battle only when all of these hold:

- they have `play` in the encounter's campaign;
- the encounter is filed under a campaign;
- the DM has turned on **Show to players**.

Anything else answers 404.

## Encounter changes (`lib/dm/encounter.ts`)

Schema additions. Older stored encounters read with these defaults:

```ts
creatureRefSchema gains   { source: "character", id: uuid }

combatant += {
  alias: string ≤ 40 | null,      // what players see; null → "Enemy N" (or the real name on the party side)
  revealed: boolean,              // players see the real name
  hidden: boolean,                // players do not see this combatant at all (an ambush not sprung yet)
  playerNumber: int 1..999 | null // the N in "Enemy N", fixed when the combatant is added
}

encounter += {
  shownToPlayers: boolean,
}
```

Defaults: `alias null`, `hidden false`, `shownToPlayers false`. `revealed` is
`true` for player and friendly combatants and `false` for everything else.
`playerNumber` is assigned when a non-party combatant is added, as one more than
the highest number in the encounter, so removing a combatant never renumbers the
others. `launchCopy` keeps aliases and numbers, and resets `shownToPlayers` and
`hidden` to their template values.

### Linked combatants

A combatant with `ref.source = "character"` is **linked**:

- `kind` is `player`. The character must belong to the encounter's campaign; an
  encounter not filed under a campaign cannot hold linked combatants.
- Its HP, temp HP, max HP, conditions and concentration **live on the sheet**.
  The encounter keeps a snapshot of them, refreshed on every save, as a
  fallback for when the sheet is deleted. Then the row shows "sheet missing"
  and becomes a plain combatant built from the snapshot.
- AC, max HP, initiative bonus and passive Perception come from `derive` on the
  sheet.
- Initiative stays in the encounter. It belongs to this fight, not to the
  character.

### Tracker behaviour (`components/dm/combat/`)

- **Add from party.** `AddCombatant` gets a **Party** tab listing the campaign's
  active sheets, plus **Add whole party**. A prepared encounter launched from an
  area gets a "Add active party" checkbox, ticked by default.
- **Vitals.** `useEncounter` loads the linked sheets' bodies once, and polls
  their vitals every 2 s through a batch endpoint (below). Rows merge encounter
  data with sheet data.
- **Edits on linked rows** send sheet ops (sub-project 3) instead of changing
  the encounter: damage, heal, temp HP, conditions, concentration. They apply
  optimistically and roll back on refusal.
- **Start of turn.** When the turn passes to a linked combatant, `nextTurn`
  sends `tickConditions` to the sheet instead of ticking locally. Unlinked rows
  tick as today.
- **New controls on each row** (DM only):
  - an alias field;
  - **Reveal name** and **Hide from players** toggles;
  - a link badge that opens the sheet in manager mode.
- **New controls in the header:**
  - **Show to players**, which shows a "players can see this" banner when on;
  - **End battle**, which runs today's `endCombat`, turns off Show to players,
    and handles notes (below);
  - a notes panel listing every player note in the encounter, with author,
    visibility and kept-or-not.

## API

### For the DM

| Method and path | Does |
|---|---|
| `GET /api/sheets/vitals?ids=a,b,c&since=a:3,b:7` | Batch vitals for up to 20 sheets the caller can manage. Returns only the ones newer than `since`, plus the current body versions. |
| `PUT /api/dm/encounters/:id` | As today. The server compares the stored and new encounter and runs the side effects below. |
| `GET /api/dm/encounters/:id/notes` | Every note in the encounter. |
| `GET /api/dm/campaigns/:campaign/notes` | Every kept note in the campaign, for the party page. |
| `GET/PUT /api/dm/campaigns/:campaign/settings` | `{ turnPing: { enabled, channelId } }`. Needs `dm` in the campaign. |

Side effects in the encounter save route, run after the write commits and
best-effort (a failure is logged and never fails the save):

| Change | Effect |
|---|---|
| `shownToPlayers` turned on, or the linked party changed while on | Push the initiative roster to the bot |
| `shownToPlayers` turned off, or the encounter ended | Clear the bot roster |
| `round` or `turn` changed, round ≥ 1, shown to players, turn pings on | Turn ping (rules below) |
| Ended (`round` 1+ → 0) or deleted | Purge fight-only notes |

### For players (`/api/play/battles/**`)

| Method and path | Does |
|---|---|
| `GET /api/play/battles?campaign=` | The shown encounters in a campaign: `{ id, name, round }`. Usually zero or one. |
| `GET /api/play/battles/:id` | The `PlayerBattleView`. Supports `If-None-Match`, with an ETag over the encounter version, the linked sheets' vitals versions, the visible notes' latest change, and the viewer. Idle polling answers 304. |
| `POST /api/play/battles/:id/initiative` | `{ mode: "normal"\|"advantage"\|"disadvantage" }`. The server rolls d20 plus the viewer's active sheet's initiative and stores an initiative report (below). Allowed while that combatant has no initiative yet. |
| `GET/POST /api/play/battles/:id/notes` | The viewer's own notes plus party-shared notes; create one. |
| `PUT/DELETE /api/play/notes/:noteId` | Author only. |
| `GET /api/play/notes?campaign=` | Kept notes in a campaign, the viewer's own plus party-shared, grouped by battle. |

Players poll `GET /api/play/battles/:id` every 2 s while visible and every
15 s while hidden.

### `PlayerBattleView` (`lib/play/battleView.ts`)

```ts
{
  id, name, round,
  turn: { key: string } | { hidden: true } | null,   // null: not started
  entries: [{
    key: string,            // the combatant id (random 16 hex, says nothing)
    label: string,          // see naming rules
    side: "party" | "enemy",
    you: boolean,
    band: "max" | "mid" | "low" | "down",
    conditions: string[],   // names only, no round counts
    initiative: number | null,   // only on the viewer's own entry
    portrait: boolean,      // party entries with a portrait; fetched from /api/sheets/:id/portrait?battle=…
  }],
  me: { characterId, name, hp, maxHp, tempHp, conditions, concentration, deathSaves } | null,
  notes: Note[],
}
```

**Projection rules (`toPlayerView`):**

- Leave out `hidden` combatants entirely. When one holds the turn, `turn` is
  `{ hidden: true }` and the page says "Someone else's turn".
- **Order** is the tracker's order (initiative order once started).
- **Side.** `party` for player combatants and friendly NPCs; `enemy` otherwise.
- **Label.**
  - `revealed`: the real name;
  - otherwise the alias;
  - otherwise "Enemy N" from `playerNumber`.

  Party entries default to revealed; the DM can still alias one, such as a
  disguised ally.
- **Band**, in thirds, for every entry including the viewer's own:
  - `max` when `hp × 3 > maxHp × 2`;
  - `mid` when `hp × 3 ≥ maxHp`;
  - `low` when `hp > 0`;
  - `down` at 0.

  Temp HP does not count.
- **Exact numbers** appear only in `me`, the viewer's own active sheet in the
  battle. That is the viewer's own data, which they can already read on their
  sheet.
- **Never included:** AC, HP numbers of others, max HP of others, temp HP of
  others, initiative of others, `ref`, `kind`, `notes` (the DM's combatant
  notes), `alias` itself (when revealed), the real name (when not revealed),
  `hidden`, `playerNumber`, concentration of others, condition durations, the
  encounter's `kind`, and anything from a stat block.

**Portraits in battle:** `GET /api/sheets/:id/portrait?battle=<encounterId>` is
also allowed for a viewer who can open that battle, when that sheet is a
non-hidden linked combatant in it.

## Notes

```sql
CREATE TABLE battle_notes (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL,
  encounter_name TEXT NOT NULL,        -- snapshot, for kept notes after the encounter is gone
  combatant_id TEXT NOT NULL,
  target_label TEXT NOT NULL,          -- the label the author saw when writing it
  author_user_id TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('private', 'party')),
  keep INTEGER NOT NULL CHECK (keep IN (0, 1)),
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX battle_notes_encounter ON battle_notes (encounter_id);
CREATE INDEX battle_notes_campaign ON battle_notes (campaign_id, keep);
```

- **Choices per note.** The author picks Private or Party, and "Keep after the
  fight" (off by default), and can change both later.
- **Visibility.**
  - private: the author and the DM;
  - party: every player with `play` in the campaign, and the DM.

  The DM (`dm` in the campaign) reads every note and cannot edit them.
- **`target_label`** is stored as the author saw it, so a kept note about
  "Enemy 2" never reveals the real name later. When the DM reveals a name
  mid-fight, new notes carry the revealed name. Old notes keep their label.
- **End battle** deletes notes with `keep = 0` and leaves kept notes in place.
  Deleting the encounter does the same.
- Limit: 200 notes per author per encounter.

## Bot (`dnd_bot`)

### Initiative roster and `/init` (`initiative.py`, `cogs/initiative.py`)

Migration `005_initiative_roster.sql`:

```sql
CREATE TABLE IF NOT EXISTS initiative_roster (
  user_id    TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  bonus      INTEGER NOT NULL,
  campaign_id TEXT,
  updated_at TEXT NOT NULL
);
ALTER TABLE initiative_reports ADD COLUMN source TEXT NOT NULL DEFAULT 'typed';   -- 'typed' | 'rolled'
```

New API:

- `POST /api/v1/initiative/roster` with
  `{ "campaign_id": str, "entries": [{ "user_id", "label" ≤ 40, "bonus": -20..40 }] ≤ 20 }`.
  This replaces the whole roster.
- `POST /api/v1/initiative/roster/clear`.

Both are called only by the portal server, through `lib/bot/server.ts`, and
have no proxy allowlist rule. The same goes for `turn/announce` below.

Changed API:

- `GET /api/v1/initiative` reports gain `"user_id"` and `"source"`. The module
  docstring changes accordingly. Discord ids now reach the portal for initiative
  reports. Each one is the id of a member who chose to report, and the portal
  already stores the ids of signed-in players.

Changed command:

- `/init` makes `total` optional and adds an optional `mode` (normal,
  advantage, disadvantage).
  - **With a total:** as today.
  - **Without a total**, when the author is in the roster: roll d20 (two with
    a mode) using `secrets`, add the bonus, store the report as `rolled`, and
    answer ephemerally: "Rolled 14 + 3 = **17** for Aria."
  - **Without a total**, when the author is not in the roster: answer
    ephemerally: "No battle is waiting on you. Use `/init total:<n>`."
- The existing cooldown applies to both forms.

### Portal side of initiative

`lib/dm/initiativeReports.ts` matches a report to a combatant:

1. a linked combatant whose sheet owner is `report.user_id`;
2. otherwise the existing name rules.

The tracker's reports list gains **Apply all matched**.

Reports made on the player battle page are stored by the portal in
`battle_initiative (encounter_id, character_id, value, breakdown, at)` and show
in the same list, marked "from the battle page". Nothing applies a total
without the DM, as today. **Auto-apply matched**, a per-encounter switch off by
default, lets the tracker apply matched reports on its own.

### Turn pings

Campaign setting, stored in the portal:

```sql
CREATE TABLE campaign_settings (
  campaign_id TEXT PRIMARY KEY,
  turn_ping_enabled INTEGER NOT NULL DEFAULT 0,
  turn_ping_channel_id TEXT
);
```

**When the portal pings.** In the encounter save route, when all of these hold:

- the turn moved (round or turn changed) and round ≥ 1;
- the encounter is shown to players;
- turn pings are on for the campaign, with a channel set;
- the new current combatant is linked, not hidden, and its sheet has an owner;
- that combatant is not the one pinged last for this encounter;
- at least 3 s have passed since the last ping for this encounter.

The last two rules stop a DM clicking through turns from flooding the channel.

Bot endpoint `POST /api/v1/turn/announce` in a new `routes_turns.py`:

- Body:
  `{ "channel_id", "user_id", "character_name" ≤ 40, "encounter_name" ≤ 80, "round": 1..10000 }`.
- The channel must be a text channel of the configured guild, checked the same
  way dice announce checks it.
- Posts "⚔️ Round 3 · **Aria**, your turn" followed by the mention, with
  `AllowedMentions(users=[member])` only. The member is looked up in the guild,
  and the mention is dropped if they are not in it. Text goes through
  `escape_markdown`.
- Answers `{ "sent": true }`. A Discord refusal answers 502, as dice does.

`GET /api/v1/guild/channels` lists the guild's text channels the bot can send
in (`{ id, name, category }`) for the setting's channel picker. Allowlist
permission: `dm`. It is in this spec rather than 02 because only turn pings use
it.

## Pages

### Player battle page (`/play/c/[campaign]/battle`)

Mobile-first:

- **Top.** Encounter name, round, and whose turn it is ("Your turn!" stands out,
  with a vibration on phones that allow it).
- **Initiative list.** Each entry shows its label, a party or enemy marker, a
  health band shown as three pips (full, two, one, or a skull for down),
  condition chips, and a notes icon with a count. The current turn is
  highlighted, and the viewer's own row is marked.
- **My character** panel, collapsible. Exact HP and temp HP, quick damage and
  heal, conditions, concentration, death saves, and a link to the full sheet.
  These go through the same sheet ops.
- **Roll initiative**, shown while the viewer's combatant has no initiative.
- **Notes.** Tap an entry to see the visible notes on it and add one, with
  Private/Party and Keep toggles.
- **No battle.** When nothing is shown: "No battle right now". The page keeps
  polling the list every 10 s and switches in when the DM shows one. With two
  shown at once (rare), a picker.

`/play/c/[campaign]/notes` lists kept notes, grouped by battle and target.

### DM

- The tracker changes above.
- **Party page** (`/dm/party`, from 03) gains:
  - a Notes tab showing kept notes, by battle;
  - the campaign's **Discord turn pings** setting: an on/off switch and a
    channel picker.

### Demo

`/demo/play/c/<demo>/battle` runs on a made-up shown encounter. A "DM view /
player view" switch shows the same fight both ways, which is also the best
quick check that the projection hides what it should.

## Testing

- **`toPlayerView`, golden JSON.** Take an encounter that has every field set:
  real names unlike their aliases, AC 17, DM notes with a marker string, hidden
  combatants with marker names, condition durations, a linked party with exact
  HP. Assert:
  - no forbidden value (each marker, each AC, each other combatant's HP and max
    HP) appears anywhere in the serialised view;
  - only allowlisted keys exist at every level;
  - hidden combatants are absent;
  - the hidden-turn case is reported as `{ hidden: true }`;
  - bands sit on the right side of each boundary (exactly 2/3, exactly 1/3, 1 HP,
    0 HP).
- **Access.** Each battle route refuses:
  - a player without `play` in the campaign;
  - an encounter that is not shown;
  - an unfiled encounter;
  - no session.

  A player in a second campaign sees only that campaign's battles.
- **Sync.** Damage on a linked row becomes a sheet op, and the sheet shows it.
  A player's heal on the battle page shows in the tracker on the next poll. Two
  DM damage clicks and one player heal at once all land.
  `tickConditions` runs once per turn for linked rows.
- **Notes.**
  - Each visibility shows to the right people.
  - Editing and deleting are author-only.
  - Ending a battle purges fight-only notes and keeps kept ones.
  - `target_label` never changes after a reveal.
- **Save side effects.** Roster push and clear, turn ping with every one of its
  conditions (on, off, hidden, unowned, same combatant, throttled), note purge
  on end. A bot failure does not fail the save.
- **Bot.**
  - Roster replace and clear.
  - `/init` with a total, without a total in the roster, and without a total
    outside the roster.
  - Advantage and disadvantage take the higher or lower roll.
  - Reports include `user_id` and `source`.
  - Turn announce validates its inputs, mentions only the named user, and drops
    the mention when the user is not in the guild.
  - Channel list.
  - Contract tests on both sides.

## Rollout

1. **Bot first.** The new endpoints and the `/init` change. Existing portal
   calls keep working: new response fields are added, none are removed.
2. **Portal schema changes.** They are additive with defaults, so old encounters
   load unchanged.
3. **Turn pings** ship off for every campaign; the DM turns them on.

## Risks

- **Leaking hidden information.** This is the main risk. Handled by the
  allowlist projection, the golden-JSON test, and 404 for every case outside
  the rules.
- **Polling load.** A party of 6 and the DM, polling every 2 s, is about 200
  requests a minute. Most answer 304 from an ETag check that reads two
  integers per sheet. This is well inside the existing rate limits (240/min per
  user) and SQLite's capacity.
- **Tracker complexity.** Merging sheet vitals into rows touches the tracker's
  core loop. Unlinked encounters must behave exactly as today. The existing
  tracker tests run unchanged, and new tests cover the linked rows.
