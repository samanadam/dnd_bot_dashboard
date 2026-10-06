# 02 Roles and permissions

Date: 2026-10-06
Repos: `dnd_bot_dashboard` (portal), `dnd_bot` (one read endpoint)
Part of: [Players, spells and role permissions](2026-10-06-players-and-spells-overview.md)

## Goal

Replace the two fixed tiers of today with permissions the owner manages in the
dashboard:

- today, anyone holding a role in `ALLOWED_ROLE_IDS` uses every bot page, and
  only users in `DM_USER_IDS` reach the DM tools;
- after this, each Discord role maps to a set of **permission toggles**, for all
  campaigns or for named ones, and a user's access is the union of their roles'
  grants.

This also creates the empty **player area** (`/play`) that sub-projects 3 and 4
fill.

This is a security change: every page and every API route changes its gate.
It gets its own security review before merge.

## Security stance

- **Deny by default.** No grant, no access. A permission that is not granted
  answers 404 `not_found`, the same as an unknown URL.
- **The owner cannot be locked out.** `DM_USER_IDS` stays in env and always
  has every permission in every campaign. Nothing in the dashboard edits it.
- **Only the owner edits grants.** No permission lets a user grant
  permissions, so a co-DM cannot raise their own access.
- **Server decides.** Pages, route handlers and the bot proxy each check the
  permission on the server. Hiding a link in the nav is cosmetic only, as today.
- **Fresh.** Grants are read from the database on every request, so a change
  in the dashboard applies on the next request. A user's Discord roles are
  re-read on the existing 5-minute recheck. Losing a role in Discord takes
  effect within 5 minutes, which is today's guarantee.
- **Audited.** Every grant change, and every sign-in refused for missing
  access, goes to the audit log.

## Permissions

| Permission | Scope | Grants |
|---|---|---|
| `bot.view` | global | Bot overview: health, stats, recording state, music state, campaign list (read). |
| `bot.recording` | global | Start, stop, split, cancel and recover recordings; transcription sync. |
| `bot.music` | global | Music player, queue, library, uploads, joining and leaving voice. |
| `bot.sessions` | global | Session list, transcripts, transcript search, renaming sessions and filing them under campaigns, trash. |
| `bot.campaigns` | global | Create and edit campaigns: terms, corrections, settings. |
| `play` | campaigns | The player area: own sheets, spells, battle page (sub-projects 3 and 4). |
| `sheets.manage` | campaigns | See and edit every sheet in the campaign, assign owners, mark active (sub-project 3). |
| `dm` | campaigns | Every DM tool: bestiary, NPCs, combat, areas, items, spells, dice, soundboard, initiative reports. Includes `sheets.manage`. |

Owner-only, never grantable: editing grants, reading the guild role list, and
the hard-delete actions that are DM-only today (session purge).

**Scope rule.** A grant has a campaign scope: "all" or a list of campaign ids.
The scope applies only to the campaign-scoped permissions. Bot permissions are
global, because a recording, the music player and the session list are not
filed under one campaign. The grant editor greys out the campaign picker when a
grant holds only bot permissions.

**Content filed under no campaign.** Content filed under no campaign (DM rows
with `campaign_id NULL`) is visible to the owner and to users granted `dm` with
scope "all". A co-DM scoped to named campaigns never sees it.

### Presets

The grant editor fills toggles in one click. A preset is not stored; it only
fills the toggles.

| Preset | Toggles |
|---|---|
| Player | `play` |
| Bot operator | all five `bot.*` |
| Co-DM | `dm` (which includes `sheets.manage`) and `bot.view` |

### Upgrade path

The first time the portal starts on this version, it seeds the grants. If the
`settings` row `access_seeded` is missing, every role in `ALLOWED_ROLE_IDS`
gets a grant with the Bot operator toggles and scope "all", and the row is
written. This happens in one transaction, so a crash leaves no partial grants.
After that, `ALLOWED_ROLE_IDS` is read only by this seed. It becomes optional
in `lib/env.ts`; when it is set after seeding, a startup log line says it is
ignored.

## Data

Migration appended to `lib/dm/db.ts`:

```sql
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE role_grants (
  role_id TEXT PRIMARY KEY CHECK (length(role_id) BETWEEN 17 AND 20),
  label TEXT NOT NULL DEFAULT '',          -- role name as last seen, for display only
  permissions TEXT NOT NULL,               -- JSON array of permission names
  all_campaigns INTEGER NOT NULL CHECK (all_campaigns IN (0, 1)),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE TABLE role_grant_campaigns (
  role_id TEXT NOT NULL REFERENCES role_grants (role_id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  PRIMARY KEY (role_id, campaign_id)
);

-- Everyone who has signed in, so the DM can assign a sheet to them (sub-project 3).
CREATE TABLE portal_users (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url TEXT,                         -- cdn.discordapp.com only
  role_ids TEXT NOT NULL DEFAULT '[]',     -- JSON, as of the last sign-in or recheck
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);
```

`portal_users` is written on each successful sign-in and on each recheck that
returns roles. It also answers "who holds this role?" for the grant editor and
"which players can be assigned a sheet in this campaign?" for sub-project 3. It
holds a Discord user
id and a display name, which the privacy page must now mention. It is the only
place a non-owner's Discord id is stored, and it is never sent to the browser
except as the opaque value of an "assign to" choice to a user who can manage
sheets.

## Resolving access (`lib/access/`)

Pure, framework-free and unit-tested:

```ts
type Permission = "bot.view" | "bot.recording" | "bot.music" | "bot.sessions" | "bot.campaigns"
               | "play" | "sheets.manage" | "dm";
type Scope = "all" | ReadonlySet<string>;          // campaign ids
type Access = { userId: string; owner: boolean; grants: ReadonlyMap<Permission, Scope> };

resolveAccess(userId, roleIds, ownerIds, grants): Access
can(access, permission, campaignId?: string | null): boolean
campaignsFor(access, permission): Scope | null     // null: none
seesUnassigned(access, permission): boolean        // owner, or scope "all"
```

- The scopes of every grant holding a permission are merged: any "all" wins,
  otherwise the sets are unioned.
- `dm` implies `sheets.manage` with the same scope.
- `can(access, p)` without a campaign asks "anywhere at all?". With
  `campaignId = null` it asks about unassigned content.
- Unknown permission names in a stored grant are ignored. This lets a rollback
  run against a database written by a newer build.

Server glue (`lib/access/server.ts`, `server-only`):

- `getAccess()` reads the session (user id and role ids) and the grants
  (`GrantRepo`), then returns `Access`. Memoised per request with React's
  `cache()`.
- `requireAccess(permission, campaignId?)` is the page gate. No session
  redirects to `/signin`; no permission calls `notFound()`.
- `guardApi(request, { permission, campaignId? }, deps)` is the route gate.
  It generalises today's `guardDm` and keeps its order: session, permission,
  same-origin portal header, rate limit. Rate limit buckets are keyed by user
  as before.

## Sign-in and session

`checkDiscordAccess` keeps calling
`/users/@me/guilds/{guild}/member` with the user's own token, but returns the
member's role ids instead of a yes/no on a fixed role list:

```ts
type MemberResult = { kind: "member"; roleIds: string[] } | { kind: "denied"; reason } | { kind: "unknown" };
```

`auth.ts`:

- **Sign-in** is allowed when the user is the owner, or when at least one of
  their roles holds a grant with at least one permission. Otherwise it is
  refused with `missing_role`, as today. The user's row in `portal_users` is
  upserted.
- **The JWT** gains `roleIds: string[]` (at most 250 entries, snowflakes only).
  The cookie stays encrypted, and role ids never go into the client session
  object.
- **Recheck** (`reverify`, every 5 minutes) refreshes `roleIds` from the same
  Discord call. A refreshed list goes into an in-memory map next to
  `verifiedCache`, so server components that cannot rewrite the cookie still
  see it. A recheck that finds no granted role ends the session (`denied`),
  just as losing the allowed role does today.

## Route and page gates

Every existing gate is replaced. Tests enumerate the route files so nothing is
missed (see Testing).

### Pages

| Path | Gate |
|---|---|
| `/` | signed in; shows only the tools the user can reach |
| `/bot` | `bot.view` |
| `/bot/music` | `bot.music` |
| `/bot/sessions`, `/bot/sessions/[id]`, `/bot/search` | `bot.sessions` |
| `/bot/campaigns` | `bot.campaigns` (read-only list for `bot.view`) |
| `/dm/**` | `dm` anywhere; lists filtered to the user's `dm` campaigns |
| `/play/**` | `play` anywhere; campaign pages check that campaign |
| `/settings` | signed in |
| `/settings/access` | owner |

`lib/tools/registry.ts` replaces `dmOnly` with `permission` on each tool and
each link. `visibleTools(access)` keeps a tool when the user can reach at least
one of its links. A new tool, **Party** (`/play`, `users` icon), appears for
`play`.

### Bot proxy (`lib/bot/allowlist.ts`)

`Rule.dmOnly` is replaced by a required `permission: Permission | "owner"`.
Making it required means the compiler flags any rule left unclassified.
`handleBotRequest` takes `access` instead of `isDm` and refuses with 404 when
`can(access, rule.permission)` fails.

| Rules | Permission |
|---|---|
| `health`, `stats`, `recording` (GET), `music/state`, `transcription` (GET), `campaigns` (GET), `campaigns/:campaign` (GET) | `bot.view` |
| `recording/*` (POST), `transcription/sync` | `bot.recording` |
| `music/*` except state, `music/queue*` | `bot.music` |
| `sessions` (GET), `sessions/:session/transcript`, `transcripts/search`, `sessions/:session/update`, `sessions/:session/campaign`, `sessions/trash`, `sessions/:session/trash`, `sessions/:session/restore` | `bot.sessions` |
| `sessions/:session/purge` | owner |
| `campaigns` (POST), `campaigns/:campaign/update`, `campaigns/:campaign/terms`, `campaigns/:campaign/corrections` | `bot.campaigns` |
| `dice/announce`, `initiative`, `initiative/clear`, `soundboard*` | `dm` |

The new `guild/roles` endpoint gets **no** allowlist rule. Only the grants API
calls it, server-side, through `lib/bot/server.ts` (see the overview).

`sessions/trash` and `soundboard` are DM-only today, and the table above keeps
them DM-only. Moving the trash list to `bot.sessions` is the one widening, since
restoring and trashing already sit there. Flag this in the security review.

The proxy's shared read cache stays: every user entitled to a bot read is
entitled to the same data. The cache key does not need the user, because the
permission check runs before the cache.

### DM API (`/api/dm/**`)

`guardDm` becomes `guardApi(..., { permission: "dm" })`. Campaign scoping is
then enforced in the handlers:

- **Lists.** The `campaign` query is checked against `campaignsFor(access, "dm")`.
  Asking for a campaign outside the scope answers 404. "All" for a scoped
  co-DM means "all of mine": the repos take a `Selection | ReadonlySet<string>`
  and add `campaign_id IN (…)` with bound parameters.
- **By id** (get, update, delete, launch, reorder). After loading the row, the
  handler checks `can(access, "dm", row.campaignId)` and answers 404 when it
  fails, the same as a missing row.
- **Moving a row to another campaign** needs `dm` in both the old and the new
  campaign.
- **SRD reads** (monsters, items, spells, feats) need `dm` anywhere.

Every DM repo needs a scoped `list` and a `campaignOf(id)` helper: creatures,
encounters, scenes, saved tracks, tags, items, areas, spells and feats.

### The DM tool for a scoped co-DM

The campaign selector lists only their campaigns, and "Unassigned" is hidden.
Nothing else in the DM pages changes.

## Settings page (`/settings/access`, owner only)

- **List of grants.** Each row shows the role as a chip in the role's own
  colour, the preset it matches (or "Custom"), the permissions as short labels,
  and its scope ("All campaigns", or the campaign names).
- **Add a role.** A picker of the guild's roles that have no grant yet, then the
  toggles, preset buttons and scope (All, or a multi-select of campaigns from
  the bot).
- **Edit and delete.** Deleting asks for confirmation and names how many
  signed-in users would lose access, counted from `portal_users` against
  last-seen role ids.
- **Check a role combination.** Pick roles; the page shows the resulting
  permissions per campaign. This runs `resolveAccess` in the browser, on
  data the owner already has.
- **Warnings.** Shown when a role holds `dm` with scope "all" ("sees every
  campaign, including unassigned content"), and when a role held by more than
  half of the signed-in users is granted anything beyond `play`.
- A note at the top explains that `DM_USER_IDS` (the owner) always has full
  access and is set in server config.

API (owner-guarded, audited):

| Method and path | Does |
|---|---|
| `GET /api/access/grants` | Every grant, plus the guild's roles from the bot (name, colour, position) |
| `PUT /api/access/grants/:roleId` | Create or replace one grant `{ permissions, scope: "all" \| string[] }`. The role must exist in the guild. |
| `DELETE /api/access/grants/:roleId` | Remove one grant |

Body validation: permissions from the enum, at most 50 campaign ids, each a
12-hex campaign id. A grant naming a campaign the bot does not know is refused.

Audit event `access_change` with the role id, permissions before and after,
and scope before and after.

## Bot (`dnd_bot`)

`GET /api/v1/guild/roles` in a new `routes_guild.py`:

- Reads `bot.get_guild(config.guild_id).roles`.
- Leaves out `@everyone` (id equal to the guild id) and managed roles
  (integrations, bot roles).
- Answers `[{ "id": str, "name": str, "color": int, "position": int }]`,
  sorted by position, highest first. Names are returned as-is; they are data,
  never posted to Discord, and the portal renders them as plain text.
- 503 `guild_unavailable` when the bot is not connected or not in the guild.
- Bearer auth as every route. Contract test in `tests/test_api_guild.py`.
  The portal's contract test (`tests/bot-contract.test.ts`) gains the schema.

## Demo

`/demo` signs nobody in, so the demo shows the whole app as the owner would see
it, as today. `/demo/settings/access` shows made-up grants and roles. A "view
as" switch in the demo header (Owner / Co-DM / Player) shows the same pages
under a made-up `Access`, which is the cheapest way to see what each role gets.

## Testing

- **`resolveAccess` and `can`.** Table-driven: owner; no roles; a single grant;
  overlapping grants (all + set, set + set); `dm` implying `sheets.manage`;
  unknown permission names; empty sets; unassigned content for scoped and
  all-campaign users.
- **Every route is gated.** A test walks `app/api/**/route.ts` and
  `app/(portal)/**/page.tsx` and fails on any file that does not call
  `guardApi`, `requireAccess`, `handleBotRequest`, or a listed public
  exception (`health`, `auth`). This keeps a new route from shipping without a
  gate.
- **Proxy.** Every rule has a permission (enforced by the type). For each
  permission, an allowed and a refused call. `owner` rules refuse a full Co-DM.
- **DM scoping.** For each DM resource, a scoped co-DM:
  - cannot list another campaign;
  - cannot get, update or delete a row in another campaign;
  - cannot see unassigned rows;
  - cannot move a row into a campaign outside their scope.
- **Sign-in.** Owner without roles is allowed. A role with a grant is allowed.
  A role without a grant is denied. `roleIds` are refreshed on recheck. Losing
  the last granted role ends the session.
- **Seeding.** Runs once. Nothing happens when `ALLOWED_ROLE_IDS` is empty.
  Re-running after the setting is written does nothing.
- **Grant API.** Owner only. Unknown role and unknown campaign are refused.
  Validation limits hold. Audit entries are written.
- **Bot.** `guild/roles` filters `@everyone` and managed roles, answers 503
  when the guild is missing, and needs the bearer token.

## Rollout

1. Ship the bot endpoint first. The portal tolerates its absence: the settings
   page shows role ids without names and says the bot is out of date.
2. Ship the portal. Seeding gives current users exactly today's access.
3. The owner adds a Player role grant.

**Rollback.** The new tables are ignored by the old build, which still reads
`ALLOWED_ROLE_IDS` from env. Keep the variable set until the new version has
been stable for a while.

## Risks

- **A missed gate.** Mitigated by the route-walking test and the required
  `permission` on proxy rules.
- **Campaign scoping in DM repos** touches many queries. Mitigated by the
  per-resource scoping tests above, written before the change.
- **Role ids in the JWT** make the cookie larger. At most about 5 KB for 250
  roles; real members hold a handful.
- **Discord outage during recheck.** Unchanged: sessions survive 30 minutes on
  the last known roles, then fail closed.
