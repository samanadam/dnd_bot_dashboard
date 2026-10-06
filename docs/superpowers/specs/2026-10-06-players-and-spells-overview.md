# Players, spells and role permissions: overview

Date: 2026-10-06
Repos: `dnd_bot_dashboard` (portal) and `dnd_bot` (bot API and slash commands)

This file records what was agreed and how the work is split. Each sub-project
has its own spec; this one is the map and the list of decisions they share.

## Goal

Today the portal is for the DM and for people who run the bot. Players have no
place in it: a "player" in combat is a name, an initiative bonus, AC and HP the
DM types by hand.

After this work:

- Players sign in with Discord and keep **detailed character sheets** (stats,
  multiclass, feats, spells, inventory, resources, companions, backstory,
  portrait), with every number worked out for them.
- The DM sees and edits every sheet, and **adds characters to combat from their
  sheets**. Damage, healing, conditions, concentration and spell slots stay in
  sync between the tracker and the sheet in both directions, within seconds.
- Players follow a battle on **their own battle page**: initiative order, whose
  turn it is, health as bands (never numbers), aliases instead of monster names,
  and their own notes. They never see AC or monster stats, in or out of combat.
- A **spell library** (SRD 5.1 and 5.2 plus custom spells) and a **feat
  library** serve both the DM and the sheets.
- The owner manages **role-based permissions** from the dashboard: each Discord
  role gets a set of permission toggles, for all campaigns or chosen ones.
- The **bot** posts sheet rolls to Discord, takes character names from active
  sheets, lands `/init` on the right combatant (and can roll it from the sheet),
  and pings a player when their turn comes.

## Decisions

### Access

| Topic | Decision |
|---|---|
| Who uses the player side | Players sign in with Discord. The DM sees and edits everything. |
| How access is granted | Discord roles mapped to permission toggles on a settings page. A user's access is the union of their roles' grants. |
| Campaign scope | A grant covers all campaigns or the campaigns it names. Bot-control permissions are global; player, sheet and DM permissions are scoped. |
| Owner | `DM_USER_IDS` stays the fixed owner: full access, cannot be edited out from the dashboard. Only the owner edits grants. |
| Upgrade | `ALLOWED_ROLE_IDS` is copied once into grants as "Bot operator" (all bot permissions), so nobody loses access on upgrade. |
| Two campaigns | Union of grants. Each sheet belongs to one campaign. `/play` lists the player's campaigns; they work in one at a time. |

### Sheets

| Topic | Decision |
|---|---|
| Who creates | Players create their own sheet in a campaign they are granted. The DM can create one and assign it to any player who has signed in once. |
| Several per campaign | Allowed (backup character, new one after a death). The DM marks one active per player per campaign. |
| Depth | Full sheet with derived math. Features are typed in; there is no level-up engine. |
| Extras | Multiclass, feats (SRD and custom), backstory section, resource trackers with rest resets, companions, portrait. |
| Edition | Per sheet, 2014 or 2024, default 2024. |
| Same character in two campaigns | "Copy to campaign" makes an independent sheet. |

### Spells and feats

| Topic | Decision |
|---|---|
| Sources | SRD 5.1 (2014) and SRD 5.2 (2024) from Open5e, same document allowlist as items. DM custom spells and feats per campaign. |
| Player homebrew | Per campaign. Visible to its author and the DM; the DM can share it with the campaign. |
| On the sheet | Spellbook (known, prepared, always prepared), slots that spend and restore, casting that spends a slot, rolls and sets concentration. |

### Combat

| Topic | Decision |
|---|---|
| Sync | Two-way and live. |
| Player battle page | Separate page, not the DM tracker. |
| Health | Bands in thirds (max, mid, low, down) for every combatant. A player sees exact numbers only on their own sheet. |
| Names | Enemies show a DM-set alias, "Enemy N" by default, until the DM reveals the real name. Party members show their names. |
| Stats | Never shown to players: no AC, HP numbers, stat blocks or bestiary, in or out of combat. |
| Notes | Player picks per note: private or shared with the party, and kept or fight-only. The DM reads all notes. |

### Bot

| Topic | Decision |
|---|---|
| Guild roles | New endpoint so the permission picker shows role names. |
| Sheet rolls | Posted to the dice channel through the existing announce endpoint, labelled with the character. |
| Character names | A player's active sheet sets their campaign character name in the bot, so transcripts use it. |
| `/init` | Lands on the player's own combatant by Discord user, and `/init` without a total rolls with the sheet's bonus. |
| Turn ping | Opt-in per campaign: the bot posts and mentions the player when their turn starts. |

## Sync approach

Chosen: **atomic vitals operations, a versioned sheet body, polling.**

- A sheet has two parts. The **body** (abilities, classes, inventory, backstory...)
  is saved whole with a version number; a stale save gets 409 and the same
  "keep mine / take theirs" prompt the combat tracker already has.
- The **vitals** (HP, temp HP, death saves, slots, resources, hit dice,
  conditions, concentration, exhaustion, companion HP) change only through small
  operations ("damage 7", "spend a 3rd-level slot") applied in one database
  transaction. Two people changing HP at the same moment both land; nothing is
  overwritten.
- A character in combat is a reference to its sheet. The tracker reads the
  sheet's vitals and writes through the same operations.
- Pages poll with TanStack Query (2-3 s on battle and open sheets), with
  version-based 304 answers so idle polling is cheap. Server push (SSE) can be
  added later without changing the data model.
- Anything a player sees in battle is **filtered on the server**. Hidden values
  never appear in a response, so nothing leaks through the network tab.

Rejected: copying sheet values into the encounter and reconciling later (two
copies of HP drift apart); SSE from day one (long-lived connections through the
reverse proxy and the session recheck, for a gain polling mostly covers).

## Sub-projects

Built in this order. Each has its own spec, plan and implementation.

| # | Spec | Depends on | Repos |
|---|---|---|---|
| 1 | [Spell and feat library](2026-10-06-01-spell-feat-library-design.md) | - | portal |
| 2 | [Roles and permissions](2026-10-06-02-roles-permissions-design.md) | - | portal, bot |
| 3 | [Character sheets](2026-10-06-03-character-sheets-design.md) | 1, 2 | portal, bot |
| 4 | [Combat link and player battle page](2026-10-06-04-combat-link-battle-view-design.md) | 2, 3 | portal, bot |

1 and 2 do not depend on each other and could be built in either order. 1 goes
first because it is small and self-contained; 2 changes access control across
the whole app and gets a security review before it merges.

## Conventions every spec follows

- **Repo pattern.** Repositories over `node:sqlite` validate rows with zod on
  the way out. Migrations are appended to `lib/dm/db.ts`, never edited.
- **Route pattern.** Handlers are plain functions with injected dependencies
  (`*Routes.ts`), wired by thin `app/api/**/route.ts` files. Every handler runs
  the guard first: session, permission, same-origin portal header, rate limit.
  Then it reads the body with a size cap and validates it with zod.
- **Refusals.** Missing permission answers 404 `not_found`, the same as an
  unknown URL, so other users learn nothing.
- **Audit.** Every write goes to the audit log with user, method, path and
  status, never with bodies.
- **Demo.** Every new page gets a `/demo` twin backed by made-up data in
  `lib/demo/*`, using the same zod schemas as the real routes.
- **Bot calls.** There are two kinds:
  - **The browser asks the bot** (only the guild channel list here). This goes
    through the existing proxy, with a new allowlist rule with its own query and
    body schema and a permission.
  - **The portal server calls the bot by itself** (guild roles, name sync,
    sheet rolls, roster, turn pings). This goes through a new `server-only`
    client, `lib/bot/server.ts`. It uses the same token, timeouts and response
    size cap as the proxy, but has **no allowlist rule**, so the browser cannot
    reach those endpoints at all.

  Every new endpoint is in both repos' contract tests.
- **Licensing.** Only SRD 5.1 and SRD 5.2 content is committed (CC-BY-4.0, with
  `data/srd/NOTICE.md`). Anything from other books stays in the DM's database.

## Out of scope for all four

- A rules engine: automatic class features, level-up choices, species traits
  applied to numbers. Features are text the player types; numbers they affect
  are typed in as bonuses.
- Map, grid, tokens or line of sight.
- Players running Discord slash commands against their sheet (`/sheet`,
  `/cast`, `/hp`). Possible later; the bot would need to read portal data.
- Server push (SSE or websockets).
- Importing sheets from D&D Beyond or PDF.
