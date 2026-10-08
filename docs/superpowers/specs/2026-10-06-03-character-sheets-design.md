# 03 Character sheets

Date: 2026-10-06
Repos: `dnd_bot_dashboard` (portal), `dnd_bot` (character names, sheet rolls)
Part of: [Players, spells and role permissions](2026-10-06-players-and-spells-overview.md)
Needs: [01 Spell and feat library](2026-10-06-01-spell-feat-library-design.md), [02 Roles and permissions](2026-10-06-02-roles-permissions-design.md)

## Goal

Detailed 5e character sheets that players keep themselves and the DM can see
and edit:

- every number worked out from the inputs (modifiers, saves, skills, passives,
  proficiency, spell DC and attack, multiclass slots, attack bonuses);
- live-play state (HP, temp HP, death saves, hit dice, slots, resources,
  conditions, concentration, exhaustion) that changes safely from several
  screens at once;
- multiclass, feats, spells (known, prepared, cast), inventory and currency,
  attunement, features, resource trackers, companions, a backstory section and
  a portrait;
- the bot learns each player's character name from their active sheet, and
  rolls made on a sheet post to the Discord dice channel.

Combat (adding a sheet to an encounter, the player battle page) is sub-project
4. This spec only makes vitals ready for it.

## Built in three phases

Each phase is shippable on its own:

- **3a. Core sheet.** Data model, derived math, vitals operations, ownership,
  the player and DM pages, inventory, features, feats, resources, backstory,
  bot name sync.
- **3b. Spells.** Spellbook, slots, casting, rests, player homebrew, sheet
  rolls to Discord.
- **3c. Extras.** Companions, portrait, copy to campaign.

## Who can do what

`canEdit(access, sheet)` is true when the user has `sheets.manage` in the
sheet's campaign, or has `play` there **and** owns the sheet.
`canManage(access, sheet)` is true with `sheets.manage` (or `dm`) in that
campaign.

| Action | Owner (player) | Manager (DM, co-DM) |
|---|---|---|
| Create a sheet in a campaign with `play` | yes, owned by themselves | yes, for any player with `play` there, or unassigned |
| View and edit body and vitals | own sheets | every sheet in their campaigns |
| Retire own sheet, or bring it back | yes | yes |
| Assign or change owner, mark active, delete | no | yes |
| Read and write DM notes | never sees them | yes |
| See other players' sheets | **no** | yes |

**Players don't see each other's sheets.** The overview agreed that "the DM sees
everything". Sharing between players was never asked for, so it stays off. A
party member's name and health band show in battle (sub-project 4); nothing
more.

**Active sheet.** A player can have several sheets in one campaign. Exactly
one per player per campaign is active, and it is the one combat and the bot
use. The first sheet a player gets in a campaign becomes active. Changing it
is a manager action. Retiring or deleting the active sheet leaves the player
with no active sheet until a manager picks one.

## Data

### Tables (migration appended to `lib/dm/db.ts`)

```sql
CREATE TABLE characters (
  id TEXT PRIMARY KEY,                      -- uuid
  campaign_id TEXT NOT NULL,                -- a sheet always belongs to one campaign
  owner_user_id TEXT,                       -- NULL: held by the DM, not assigned yet
  name TEXT NOT NULL,
  edition TEXT NOT NULL CHECK (edition IN ('2014', '2024')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired', 'dead')),
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  version INTEGER NOT NULL,                 -- body version
  body TEXT NOT NULL,                       -- sheetBodySchema
  vitals_version INTEGER NOT NULL,
  vitals TEXT NOT NULL,                     -- vitalsSchema
  dm_notes TEXT NOT NULL DEFAULT '',
  portrait TEXT,                            -- file name under PORTAL_DATA_DIR/portraits (3c)
  name_sync TEXT NOT NULL DEFAULT 'ok' CHECK (name_sync IN ('ok', 'pending')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX characters_campaign ON characters (campaign_id, name);
CREATE INDEX characters_owner ON characters (owner_user_id, campaign_id);
CREATE UNIQUE INDEX characters_one_active ON characters (campaign_id, owner_user_id)
  WHERE is_active = 1 AND owner_user_id IS NOT NULL;
```

Limits: 20 sheets per player per campaign, 500 sheets in total.

### Body (`lib/sheets/body.ts`)

Zod schema, `.strict()` throughout. A sheet body is at most 256 KB serialised.
Short strings are capped at 120 characters and long texts at 20 000 unless
noted.

```ts
sheetBodySchema = {
  identity: {
    name, playerFacingTitle?,                // "Aria Windwhisper", "the Unbroken"
    species, subspecies, background, alignment,
    size: "Tiny"|"Small"|"Medium"|"Large",
    xp: int ≥ 0, milestone: boolean,         // milestone: hide XP
    age, height, weight, eyes, hair, skin, pronouns, faith,
  },
  classes: [{                                // 1..6 entries; total level 1..20
    id, name, subclass, level: 1..20,
    hitDie: 6|8|10|12,
    caster: "full"|"half"|"third"|"pact"|"none",
    spellAbility: ability|null,
    preparedMax: int|null,                   // override; null: derived when known
    saveProficiencies: ability[],            // used only on the first class (see math)
  }],
  abilities: { str, dex, con, int, wis, cha: { base: 1..30, bonus: -10..10, override: 1..30|null } },
  proficiencies: {
    saves: ability[],                        // extra, beyond the first class
    skills: { [skill]: "none"|"half"|"proficient"|"expertise" },
    jackOfAllTrades: boolean,                // half proficiency on every non-proficient check
    armor, weapons, tools, languages: string[] ≤ 40 each,
  },
  combat: {
    ac: { mode: "manual", value } | { mode: "unarmored", extra: ability|null, bonus }
      | { mode: "armor", base: 0..30, dexCap: int|null, shield: boolean, bonus },
    initiativeBonus: int,                    // on top of Dex (Alert, items…)
    speed: { walk, fly, swim, climb, burrow: int ≥ 0 }, hover: boolean,
    hp: { mode: "manual", max } | { mode: "average", bonusPerLevel: int, bonus: int },
    senses: string ≤ 200, resistances, immunities, vulnerabilities: string[] ≤ 20,
    attacks: [{                              // ≤ 40
      id, name, ability: ability|"best-str-dex"|"spell"|"none",
      proficient: boolean, toHitBonus: int,
      damage: [{ roll: dice, type, addAbility: boolean }] ≤ 4,
      range, properties, notes, itemId: string|null,
    }],
  },
  features: [{ id, name, source, description, resourceId: string|null }] ≤ 200,
  feats: [{ id, ref: featRef|null, name, source, description, choices: string ≤ 500 }] ≤ 60,
  resources: [{                              // Ki, Rage, Bardic Inspiration…  ≤ 30
    id, name, max: int 0..99 | { formula: "level"|"prof"|`mod:${ability}`, classId?, plus: int },
    reset: "short"|"long"|"dawn"|"none", resetAmount: "all"|int,
  }],
  inventory: {
    items: [{ id, name, ref: itemRef|null, qty: 0..9999, weightLb, equipped, attuned, container, notes }] ≤ 300,
    currency: { cp, sp, ep, gp, pp: int 0..10 000 000 },
    attunementMax: 0..6,                     // 3 by default
    encumbrance: "off"|"simple"|"variant",
  },
  spellcasting: {                            // 3b
    entries: [{ id, ref: spellRef, classId: string|null, status: "known"|"prepared"|"always", notes }] ≤ 400,
    extraSlots: number[9],                   // magic items and similar, added to derived slots
  },
  companions: [{                             // 3c, ≤ 10
    id, name, kind: "familiar"|"companion"|"summon"|"mount"|"other",
    ref: creatureRef|null,                   // an SRD or custom stat block, if any
    ac, maxHp, speed, abilities?, attacks: [{ name, toHit, damage }] ≤ 6, notes,
  }],
  backstory: {
    personalityTraits, ideals, bonds, flaws, appearance,
    backstory,                               // up to 50 000 characters
    alliesAndOrganizations, treasure, goals, secretsForDm,
  },
  notes: string ≤ 50 000,
}
```

- **`secretsForDm`** is visible to the owner and to managers, a place for
  things the player tells only the DM. It is not the same as `dm_notes`, which
  the player never sees.
- **References** (`featRef`, `spellRef`, `itemRef`, `creatureRef`) point at SRD
  or custom content and are resolved when shown. Free-text name, source and
  description beside a ref act as a fallback and as house-rule notes.
- **SRD class data** lives in `lib/sheets/classes.ts`: the twelve SRD classes
  per edition, with hit die, caster type, spellcasting ability, save
  proficiencies and (2024) the prepared-spells table. Picking an SRD class
  fills those fields, which stay editable. A custom class is typed in.

### Vitals (`lib/sheets/vitals.ts`)

```ts
vitalsSchema = {
  hp: int ≥ 0, tempHp: int ≥ 0, maxHpAdjust: int,   // effects that lower or raise max
  deathSaves: { successes: 0..3, failures: 0..3 }, stable: boolean,
  hitDiceSpent: { 6?, 8?, 10?, 12?: int ≥ 0 },
  slotsSpent: int[9], pactSpent: int ≥ 0,
  resourcesUsed: { [resourceId]: int ≥ 0 },
  conditions: [{ name ≤ 40, rounds: int|null }] ≤ 12,
  concentration: { spellRef: spellRef|null, name ≤ 120 } | null,
  exhaustion: 0..6, inspiration: boolean,
  companions: { [companionId]: { hp, tempHp, conditions } },
}
```

The condition shape is the same as a combatant's, so sub-project 4 moves
conditions between the two without converting them.

## Derived math (`lib/sheets/derive.ts`)

`derive(body, vitals, lookups) → Derived` is pure and runs in the browser and on
the server. The page never stores a derived number.

- **Ability score** = `override ?? clamp(base + bonus, 1, 30)`. Modifier =
  `floor((score − 10) / 2)`.
- **Total level** = sum of class levels. Proficiency bonus = `2 + floor((total − 1) / 4)`.
- **Saving throws.** Proficient in the first class's saves plus
  `proficiencies.saves`. Multiclassing does not add saves, which is true in both
  editions.
- **Skills.** Ability mod plus proficiency × (0, ½ rounded down, 1 or 2). Jack
  of All Trades gives half proficiency on every check without proficiency.
- **Passive** Perception, Investigation and Insight = 10 + the skill total.
- **Initiative** = Dex mod + `initiativeBonus`, plus half proficiency with Jack
  of All Trades. Initiative is a Dexterity check in both editions.
- **AC.**
  - manual: the value;
  - unarmored: 10 + Dex + the chosen ability + bonus;
  - armor: base + min(Dex, cap) + 2 for a shield + bonus.
- **Max HP.** Manual is the value. Average is the first class's hit die maximum
  at level 1, then `floor(die / 2) + 1` per further level of each class, plus
  Con mod × total level, plus the bonuses. Both add `maxHpAdjust`, floor 1.
- **Hit dice.** Pool per die size = sum of levels of classes with that die,
  less `hitDiceSpent`.
- **Spellcasting per class.** Save DC = 8 + proficiency + ability mod. Attack
  = proficiency + ability mod.
- **Spell slots.** First, a caster level for the standard slot table:
  - one non-pact spellcasting class:
    - full: its level;
    - half: 2014 `level < 2 ? 0 : ceil(level / 2)`, 2024 `ceil(level / 2)`;
    - third: 2014 `level < 3 ? 0 : ceil(level / 3)`, 2024 the same.
  - several: full levels + half levels / 2 (2014 rounded down, 2024 rounded
    up) + third levels / 3 rounded down.

  The slot table (`lib/sheets/slots.ts`) gives slots per level for caster level
  1-20. Then add `extraSlots`.
- **Pact slots** (Warlock levels): count and slot level from the pact table,
  kept apart from the standard slots and restored on a short rest.
- **Prepared limit.**
  - 2014 SRD classes: Cleric, Druid and Wizard prepare ability mod + level;
    Paladin prepares ability mod + half level, rounded down. Minimum 1.
  - 2024 SRD classes use the class table.
  - Bard, Ranger, Sorcerer and Warlock in 2014 count spells known and have no
    limit here.

  `preparedMax` overrides all of this. Going over the limit shows a warning; it
  never blocks.
- **Cantrip scaling.** A spell with `scaling.by = "character"` uses the step for
  the character's total level.
- **Attacks.**
  - To hit = ability mod (the better of Str and Dex for `best-str-dex`, the
    class spell attack for `spell`) + proficiency if proficient + `toHitBonus`.
  - Damage = each roll + the ability mod where `addAbility` is set.
- **Resource max.** A number, or a formula: class level, proficiency bonus, or
  an ability mod, plus `plus`, with a floor of 1.
- **Carrying.** Simple: capacity is Str × 15 (× size factor). Variant: the
  encumbered and heavily encumbered thresholds. Weight sums equipped and carried
  items.
- **Attunement** count against `attunementMax`.
- **Exhaustion.**
  - 2014: the cumulative table. Disadvantage on checks (1), speed halved (2),
    disadvantage on attacks and saves (3), HP max halved (4), speed 0 (5). The
    page applies the speed and HP effects and marks every affected roll.
  - 2024: −2 × level to d20 tests and −5 ft × level to speed, applied to every
    roll the page makes.

Everything derived is in one result object. The page shows a breakdown on tap
("Stealth +7 = Dex +3, proficient +4").

## Vitals operations (`lib/sheets/ops.ts`)

Vitals change only through operations. `applyOp(body, vitals, op, rng) → vitals | Refusal`
is pure. The server applies it inside `BEGIN IMMEDIATE`: read the row, apply,
write, and bump `vitals_version`. A batch of up to 20 ops applies all or
nothing.

| Op | Effect |
|---|---|
| `damage { amount, crit?: false }` | Temp HP first, then HP. Instant death (`deathSaves.failures = 3`) when the damage left over after reaching 0 HP is at least the HP maximum, or when damage taken at 0 HP is. Other damage at 0 HP adds one failed death save, two on a crit, and clears `stable`. Drops concentration when HP reaches 0. Status is not changed: marking a sheet dead is a manager's call. |
| `heal { amount }` | HP up to max. From 0, clears death saves and `stable`. |
| `setHp { hp }`, `setTemp { tempHp, mode: "max"|"replace" }` | Set directly. Temp HP never stacks: `max` keeps the higher (the rules' default), `replace` overwrites. |
| `deathSave { result: "success"|"failure"|"crit"|"fumble" }`, `stabilize`, `resetDeathSaves` | Crit (natural 20): regain 1 HP. Fumble: two failures. |
| `spendSlot { level }`, `restoreSlot { level }`, `spendPact`, `restorePact` | Refused when nothing is left. |
| `useResource { id, amount }`, `restoreResource { id, amount }` | Within 0..max. |
| `spendHitDie { die, roll?: true }` | Spends one; with `roll` it heals die + Con mod (minimum 0), rolled on the server. |
| `addCondition { name, rounds }`, `removeCondition { name }`, `tickConditions` | `tickConditions` drops one round from timed conditions (sub-project 4 runs it at the start of the character's turn). |
| `concentrate { spellRef, name }`, `dropConcentration` | |
| `exhaustion { delta }`, `inspiration { value }` | |
| `cast { spellRef, slot: int 1..9|"pact"|"ritual"|"free", resourceId? }` | 3b. Spends the slot (or the resource), sets concentration if the spell needs it and answers what it replaced. Refused if the spell is not on the sheet or the slot is lower than the spell. |
| `shortRest { hitDice: { die: count } }` | Spends and rolls those hit dice. Restores pact slots and `short` resources. |
| `longRest` | Restores HP, temp HP to 0, all slots, `short`, `long` and `dawn` resources, and clears death saves. Hit dice: 2014 regains half the total (minimum 1); 2024 regains all. Exhaustion −1. |
| `companion { id, op }` | 3c. `damage`, `heal`, `setTemp` and the condition ops on one companion. |

The server rolls the dice for hit dice and rest healing with the portal's
existing RNG (`lib/dice/random.ts`, crypto-backed), and the answer includes the
breakdown. The client never sends a total.

## API (`/api/sheets/**`)

Guarded by `guardApi` from sub-project 2. The sheet's campaign is loaded first,
then `canEdit` or `canManage` is checked. A refusal answers 404.

| Method and path | Does |
|---|---|
| `GET /api/sheets?campaign=` | Summaries: the caller's own sheets, or every sheet in the campaign for managers. Name, classes, level, owner name, status, active, HP band. |
| `POST /api/sheets` | `{ campaignId, edition, name, ownerUserId? }`. A player always gets themselves as owner. A manager may name any `portal_users` user with `play` in the campaign, or leave it unassigned. Starts with a minimal valid body; HP is set from the derived max. |
| `GET /api/sheets/:id` | `{ id, campaignId, owner, edition, status, active, version, body, vitalsVersion, vitals, nameSync, dmNotes? }`. `dmNotes` only for managers. |
| `PUT /api/sheets/:id` | `{ version, body }`. 409 with the current sheet on a stale version. A changed name or edition triggers name sync. |
| `GET /api/sheets/:id/vitals?since=N` | 304 when `vitals_version ≤ N`; otherwise `{ vitalsVersion, vitals, version }`. The body version is included so the page knows when to refetch the body. |
| `POST /api/sheets/:id/ops` | `{ ops: Op[] ≤ 20 }`. Answers `{ vitalsVersion, vitals, results }`, where `results` holds rolls and replaced concentration. 422 with the refusal reason for an op that cannot apply. |
| `PATCH /api/sheets/:id/meta` | Manager: `{ ownerUserId?, active?, status?, dmNotes? }`. Owner: `{ status: "active"|"retired" }` only. |
| `DELETE /api/sheets/:id` | Manager. Hard delete, after a confirm on the page that names the sheet. |
| `POST /api/sheets/:id/name-sync` | Manager: retry a pending bot name sync. |
| `GET /api/sheets/:id/resolve?spells=&feats=&items=` | 3b. Resolves up to 200 refs to blocks, so the spellbook and feat lists render without one request per row. |
| `GET /api/sheets/:id/spells/search` | 3b. Same filters as the DM search, but the sources are the sheet's edition of the SRD, custom spells shared in the sheet's campaign, and the caller's own homebrew there. Managers also see unshared homebrew in that campaign. |
| `GET /api/sheets/:id/feats/search` | 3b. The same, for feats. |
| `POST /api/sheets/:id/roll` | 3b. `{ expression, label, mode: "normal"|"advantage"|"disadvantage", announce: boolean }`. The **server rolls**; the answer is the result and breakdown. With `announce`, the server posts it to Discord (see Bot). |
| `GET/PUT/DELETE /api/sheets/:id/portrait` | 3c. |
| `POST /api/sheets/:id/copy` | 3c. `{ campaignId }` makes an independent copy, owned by the same player, with fresh vitals. Needs `canEdit` on the source and `play` (or `sheets.manage`) in the target campaign. |

Homebrew (3b), for players with `play` in the campaign:

| Method and path | Does |
|---|---|
| `GET/POST /api/play/homebrew/spells?campaign=` | The caller's own homebrew spells in a campaign, and creating one (`author_user_id` = caller, `shared = 0`). |
| `GET/PUT/DELETE /api/play/homebrew/spells/:id` | Author only. A shared spell becomes read-only for its author; the DM owns it from then on. |
| `…/homebrew/feats/…` | The same for feats. |

The DM's spell and feat pages (sub-project 1) show homebrew with the author's
name and a **Share with campaign** button.

Limits: body cap 256 KB for `PUT /api/sheets/:id`, 16 KB elsewhere, 5 MB for
portrait uploads. Rate buckets: reads 240/min, writes 120/min, roll announce
10/min per user.

### Polling and freshness

- An open sheet polls `vitals?since=` every 3 s while the tab is visible and
  every 30 s while hidden. When the answered body version is newer than the one
  loaded, the page refetches the body.
- Body edits autosave 800 ms after the last keystroke, one save at a time, the
  same way `useEncounter` does today. A 409 shows the existing conflict prompt:
  keep mine, or take theirs.
- Vitals buttons apply optimistically and roll back if the op is refused.

## Pages

### Player area (`/play`)

- **`/play`.** The player's campaigns (from their `play` grants) as cards, each
  listing their sheets there with a "New character" button. A single campaign
  opens straight away.
- **`/play/c/[campaign]`.** The campaign's home for this player: sheets, and
  (sub-project 4) the live battle.
- **`/play/c/[campaign]/sheets/[id]`.** The sheet.

### The sheet (`components/sheets/`)

Mobile-first, because the phone is at the table. Tabs:

1. **Main.**
   - Header: portrait, name, classes and levels, species, background, XP or
     milestone, inspiration.
   - Vitals bar: HP with a damage/heal input, temp HP, death saves when at 0,
     conditions, exhaustion, concentration.
   - Combat row: AC, initiative, speed, proficiency, hit dice.
   - Abilities with modifiers and saves, skills, passives.
2. **Actions.** Attacks with to-hit and damage, each with a roll button. Shortcuts
   to prepared spells and to resources.
3. **Spells** (3b).
   - One panel per casting class: ability, DC and attack.
   - Slot pips per level, plus pact pips.
   - Cantrips and spells by level, with prepared toggles, the prepared count
     against the limit, and C/R badges.
   - A **Cast** button opens the cast dialog. A full spell view uses
     `SpellBlockView` from sub-project 1.
4. **Inventory.** Items with equipped and attuned toggles, quantities and
   weights; currency; attunement slots; carrying load. An item picker searches
   SRD and campaign items.
5. **Features and feats.** Features grouped by source. Feats from the picker
   (SRD, custom or homebrew) or typed in.
6. **Resources.** Counters with pips, use and restore, and reset type.
7. **Companions** (3c). Small stat cards with their own HP and conditions.
8. **Backstory.** Personality traits, ideals, bonds, flaws, appearance, the
   backstory itself (long text with `RichText` formatting), allies and
   organisations, treasure, goals, secrets for the DM.
9. **Notes.**

Rest buttons (short and long) sit in the header menu. Each opens a confirmation
that previews what it will restore.

**The cast dialog** (3b):

- The slot choice lists every slot level at or above the spell's level that has
  a slot left, plus pact, ritual (when the spell is a ritual) and free.
- It shows the effect at that slot or character level, taken from `scaling`.
- It shows the save DC, or rolls the attack.
- It rolls damage or healing.
- It warns when the cast will replace the current concentration.
- One `cast` op spends the slot, then the rolls go through `/roll`.

**Rolling** (3b): every check, save, attack, damage and initiative on the sheet
has a roll button.

- Advantage, normal and disadvantage are picked by tapping or long-pressing.
- A crit doubles the damage dice.
- Results land in a roll log at the bottom of the sheet, in this tab only.
- "Post rolls to Discord" is a per-device toggle, on by default.

### DM side (`/dm/party`)

- A new **Party** link in the DM tool. It lists every sheet in the selected
  campaign, grouped by player: name, classes and level, AC, HP bar, conditions,
  concentration, active flag, and a name-sync warning when one is pending.
- Opening a sheet uses the same sheet components in manager mode, which adds:
  - an owner picker, from `portal_users` with `play` in the campaign;
  - the active toggle, status, and delete;
  - a **DM notes** tab.
- **New sheet** is here too, for creating one before a player has made it.

### Demo

`/demo/play/**` and `/demo/dm/party` with two made-up characters: a single-class
wizard, and a multiclass paladin/warlock with a companion. Ops run against the
demo store using the same pure `applyOp`.

## Bot (`dnd_bot`)

### Character names from sheets (3a)

New endpoints in `routes_campaigns.py`:

- `POST /api/v1/campaigns/{campaign_id}/characters`
  with `{ "user_id": "<snowflake>", "character_name": "<1-40>" }`.
  This calls the existing `set_campaign_character`. Answers `{ "ok": true }`.
- `POST /api/v1/campaigns/{campaign_id}/characters/clear`
  with `{ "user_id": "<snowflake>" }`.

The name is cleaned with the same `clean_name` used by `/init`. Unknown campaign
answers 404. Only the sheet routes call these, server-side through
`lib/bot/server.ts`. They have no proxy allowlist rule, so no browser can reach
them.

On the portal, `syncCharacterName(campaignId, userId)` sends the active sheet's
name, or clears the mapping when there is no active sheet. It runs after every
change that can affect it: create, rename, activate, retire, delete, and owner
change (for both the old and the new owner).

- On failure, the sheet is marked `name_sync = 'pending'`. The DM's party page
  shows a warning with a retry button, and the next successful change retries
  it.
- The sheet wins inside its campaign: it overwrites a `/character set
  campaign:` mapping the player made in Discord. The global `/character set`
  mapping is untouched.

This is the first time the portal sends a player's Discord id to the bot. It is
the id of a user who signed in to the portal, sent over the existing
authenticated channel, and the bot already holds it.

### Sheet rolls to Discord (3b)

`POST /api/v1/dice/announce` gains an optional `origin` field: `"portal"`
(default) or `"sheet"`. With `"sheet"`, the footer reads "rolled on a character
sheet" instead of "rolled in the DM portal". The label already allows 80
characters, which fits "Aria · Stealth (advantage)". The portal's sheet route
calls it server-side after rolling. The player's browser never talks to the
bot.

## Testing

- **`derive`.** Table-driven tests with worked examples from the rules:
  - proficiency at every level;
  - saves of a multiclass character;
  - expertise and Jack of All Trades in both editions;
  - all three AC modes;
  - average HP for a multiclass character;
  - slots for each caster combination in both editions (paladin 1 and 2, ranger
    5 / wizard 3, paladin 3 / sorcerer 3, an Eldritch Knight custom third caster,
    and a warlock / sorcerer with separate pact slots);
  - prepared limits;
  - cantrip scaling at levels 4, 5, 11 and 17;
  - resource formulas;
  - encumbrance;
  - 2024 exhaustion.
- **`applyOp`.** Every op, including its edges:
  - damage through temp HP;
  - damage at 0 HP;
  - instant death;
  - healing from 0;
  - temp HP `max` against `replace`;
  - refusals for spending what isn't there;
  - long rest hit dice per edition;
  - a cast that replaces concentration;
  - a cast with a slot below the spell's level;
  - atomic batches.
- **Concurrency.** Two op requests on the same sheet at once both land.
  Against a file database, a `PUT` with a stale version answers 409.
- **Permissions.** For every route, check the owner, another player in the same
  campaign, a player in another campaign, a manager, a scoped co-DM in another
  campaign, and no session. `dmNotes` must never appear in an owner's
  response; assert on the serialized JSON.
- **Active-sheet rules.**
  - The first sheet becomes active.
  - The unique index refuses a second active sheet.
  - Retiring the active sheet clears it.
  - Owner changes resync both players.
- **Name sync.** With a fake bot: success, failure marks `pending`, retry
  succeeds.
- **Rolls.** The server rolls. `announce` calls the bot with `origin: "sheet"`
  and the character label. The rate limit holds.
- **Bot.** Contract tests for the two character endpoints and for `origin` on
  dice announce, plus validation errors.

## Risks

- **Scope.** This is the largest piece. The three phases keep each shippable,
  and 3a alone already replaces hand-typed player combatants.
- **Rules mistakes in `derive`.** Mitigated by worked-example tests, a
  visible breakdown on every number, and manual overrides (`override`,
  `preparedMax`, AC manual, HP manual) so a player is never stuck with a wrong
  number.
- **Body conflicts** when a player and the DM edit the same sheet's text at once.
  Vitals never conflict. Body conflicts use the tested prompt from combat.
- **Portrait uploads** are untrusted files. See 3c below.

## 3c: portrait handling

- Accepted: PNG, JPEG or WebP, at most 5 MB, checked by magic bytes and not by
  the declared type.
- Re-encoded with `sharp` (added as a direct dependency, pinned): at most
  512×512, WebP, metadata stripped (no EXIF location), animation dropped. The
  original is never stored.
- Stored as `PORTAL_DATA_DIR/portraits/<random>.webp`. The name is random and
  never derived from user input. The old file is deleted on replace.
- Served by `GET /api/sheets/:id/portrait`, after the same `canEdit` check (or
  the battle-page rule in sub-project 4), with:
  - `Content-Type: image/webp`;
  - `X-Content-Type-Options: nosniff`;
  - `Content-Security-Policy: default-src 'none'`;
  - `Cache-Control: private, max-age=300`.
