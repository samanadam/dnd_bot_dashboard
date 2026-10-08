# 01 Spell and feat library

Date: 2026-10-06
Repos: `dnd_bot_dashboard`
Part of: [Players, spells and role permissions](2026-10-06-players-and-spells-overview.md)

## Goal

1. Bundle the SRD 5.1 and SRD 5.2 spells and feats, the way monsters and items
   are bundled today.
2. Give the DM a **Spells** page: search and filter every spell, read it, and
   keep custom spells and feats per campaign.
3. Store spells and feats so that sub-project 3 can put them on sheets and cast
   them without changing this data model. That means a structured roll and
   upcast table, a class list, and an owner column for player homebrew.

Out of scope here: anything a player sees (sub-projects 2 and 3), casting,
sheets. Player homebrew rows can exist in the schema but nothing creates them
until sub-project 3.

## Data

### Import (`scripts/import-srd-spells.mts`)

Same shape as `import-srd-items.mts`:

- Fetches `https://api.open5e.com/v2/spells/` and `/v2/feats/` page by page,
  checks every `next` URL starts with the endpoint, and keeps only entries whose
  `document.key` is `srd-2014` or `srd-2024`. Everything else is dropped and
  counted.
- Writes `data/srd/spells-2014.json`, `spells-2024.json`, `feats-2014.json`,
  `feats-2024.json` as `{ edition, source, license, spells | feats: [{ slug, spell | feat }] }`.
- The slug is the Open5e key without its document prefix (`srd-2024_acid-arrow`
  becomes `acid-arrow`), matching `^[a-z0-9-]{1,80}$`.
- A `CORRECTIONS` map for obvious source errors, as in `import-srd.mts`.
- Expected counts as of 2026-10-06: 319 spells and 1 feat (2014), 339 spells
  and 17 feats (2024). The script prints the counts and fails if a file comes
  out empty.
- `data/srd/NOTICE.md` gains a paragraph for spells and feats.

Normalisation lives in `lib/dm/openSpells.ts` (pure, unit-tested), as
`openItems.ts` does for items.

### Spell block (`lib/dm/spells.ts`)

```ts
spellBlockSchema = z.object({
  name: string 1..120,
  level: int 0..9,                       // 0 = cantrip
  school: enum of the 8 schools,
  castingTime: string ≤ 60,              // "1 action", "1 bonus action", "1 reaction, which you take when…", "10 minutes"
  ritual: boolean,
  range: string ≤ 60,                    // "120 feet", "Self (15-foot cone)", "Touch"
  components: { verbal, somatic, material: boolean, materialText: string ≤ 300,
                materialCostGp: number|null, materialConsumed: boolean },
  duration: string ≤ 60,                 // "Instantaneous", "Up to 1 minute"
  concentration: boolean,
  classes: string[] ≤ 16 (each ≤ 40),    // "Wizard", "Cleric"…
  attack: "melee" | "ranged" | null,
  save: ability | null,                  // "dex", "wis"…
  effect: { kind: "damage" | "healing", roll: dice ≤ 40, types: string[] ≤ 6 } | null,
  scaling: { by: "slot" | "character", steps: [{ at: int 1..20, roll: dice }] ≤ 20 } | null,
  description: string ≤ 20 000,
  higherLevel: string ≤ 4 000,
}).strict()
```

Mapping from Open5e:

- `casting_time` codes become text: `action` → "1 action", `bonus-action` →
  "1 bonus action", `reaction` → "1 reaction" plus `reaction_condition` when
  given, `1minute` → "1 minute", and so on for every code. An unknown code fails
  the import loudly rather than guessing.
- `effect.kind` is `healing` when `damage_types` is empty and the description
  says a creature "regains" hit points (Cure Wounds, Healing Word); otherwise
  `damage` when there is a `damage_roll`; otherwise `null`.
- `scaling` comes from `casting_options`: `slot_level_N` entries give
  `{ by: "slot", at: N }` and `player_level_N` entries give
  `{ by: "character", at: N }`, each with its `damage_roll`. Entries without a
  roll are skipped.
- `attack` is `ranged` when `attack_roll` is true and the range is not Touch or
  Self, otherwise `melee`. `save` comes from `saving_throw_ability`.
- Dice strings are checked against the portal's existing dice parser
  (`lib/dice/roll.ts`). An unparseable roll is dropped with a warning, not
  committed.

### Feat block (`lib/dm/feats.ts`)

```ts
featBlockSchema = z.object({
  name: string 1..120,
  category: string ≤ 40,          // "General", "Origin", "Fighting Style", "Epic Boon"
  prerequisite: string ≤ 200,     // "" when none
  repeatable: boolean,
  description: string ≤ 20 000,   // desc plus benefits, one paragraph per benefit
}).strict()
```

`repeatable` is true when a benefit says the feat can be taken more than once.

### Database (migration appended to `lib/dm/db.ts`)

```sql
CREATE TABLE spells (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  campaign_id TEXT,              -- NULL: not filed under a campaign (DM only)
  author_user_id TEXT,           -- NULL: the DM's; else the player who wrote it (sub-project 3)
  shared INTEGER NOT NULL DEFAULT 1 CHECK (shared IN (0, 1)),
  data TEXT NOT NULL,            -- spellBlockSchema minus name
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX spells_campaign ON spells (campaign_id, name);
CREATE INDEX spells_author ON spells (author_user_id);
CREATE TABLE feats ( …same columns, data is featBlockSchema minus name… );
CREATE INDEX feats_campaign ON feats (campaign_id, name);
CREATE INDEX feats_author ON feats (author_user_id);
```

- DM rows have `author_user_id NULL` and `shared = 1`.
- Player homebrew (sub-project 3) has an author and starts at `shared = 0`:
  visible to its author and the DM. "Share with campaign" sets `shared = 1`.
- Limits: 1000 custom spells and 500 custom feats in total, checked on create.

`SpellRepo` and `FeatRepo` follow `ItemRepo`: zod on the way in and out,
`list(selection)`, `get`, `create`, `update`, `remove`. The DM-only list in this
sub-project returns every row in the selection, whatever its author.

### References

```ts
spellRefSchema = creatureRefSchema   // { source: "srd", edition, slug } | { source: "custom", id }
featRefSchema  = creatureRefSchema
```

Sheets (sub-project 3) store refs, never copies, so a DM fixing a custom spell
fixes it on every sheet. A ref whose target is gone resolves to a "missing
spell" marker, the same rule areas use for missing items.

## API

All under `/api/dm`, guarded by `guardDm` now. Sub-project 2 swaps the guard
for the permission guard without changing these handlers' shapes.

| Method and path | Does |
|---|---|
| `GET /api/dm/spells/search` | SRD and custom together. Query: `q`, `source` (all/custom/2014/2024), `level` (comma list 0-9), `school`, `class`, `concentration` (true/false), `ritual` (true/false), `campaign`, `offset`, `limit` ≤ 60. Answers `{ total, results, classes, schools }`. |
| `GET /api/dm/spells/srd/:edition/:slug` | One SRD spell. `Cache-Control: private, max-age=3600`. |
| `GET /api/dm/spells?campaign=` | The custom spells in a selection. |
| `POST /api/dm/spells` | Create. |
| `GET/PUT/DELETE /api/dm/spells/:id` | One custom spell. |
| `…/api/dm/feats/…` | The same five for feats. Search filters: `q`, `source`, `category`, `campaign`. |

A search result is
`{ ref, name, level, school, castingTime, concentration, ritual, classes, author: "dm" | "player" }`.
That is enough for a list row; the full block is fetched when a row opens.

Body caps: 64 KB (`DM_MAX_BODY_BYTES`).

## Pages

`/dm/spells`, a new link in the DM tool next to Items, with the `sparkles` icon.
Two tabs: **Spells** and **Feats**.

- **Spells tab.** A search box. Filter chips for level (cantrip, 1-9), school,
  class, concentration and ritual, plus a source switch (All / 2024 / 2014 /
  Custom). Results are rows showing level, school, casting time, and C/R
  badges. Selecting a row opens the spell in a side drawer on desktop or full
  screen on phone. Filters stay in the URL query so a filtered view can be
  bookmarked. The campaign selector filters custom spells as it does on other
  pages.
- **Spell view** (`components/dm/spells/SpellBlockView.tsx`). Name, level and
  school line, casting time, range, components with material, duration, classes,
  description (through the existing `RichText`), "At higher levels", and the
  scaling table if there is one. Used again by sheets in sub-project 3.
- **Custom spell form** (`SpellForm.tsx`). Every field of the block. Roll fields
  are checked with the dice parser as the DM types. "Duplicate as custom" on an
  SRD spell pre-fills the form for a house-ruled version.
- **Feats tab.** Same layout with a category filter, plus `FeatBlockView` and
  `FeatForm`.
- Homebrew rows (from sub-project 3 onward) carry a "Player homebrew: <name>"
  badge and a **Share with campaign** button.

The `/demo/dm/spells` twin uses a sample of about 20 spells and 5 feats in
`lib/demo/srdSample.ts`.

## Testing

- `openSpells` normalisation against saved Open5e fixtures. Cover a cantrip with
  character scaling, a levelled damage spell with slot scaling, a healing spell,
  a ritual, a reaction with a condition, a spell with a costly consumed
  material, and an unknown casting-time code (must throw).
- Allowlist: a fixture entry from another document is dropped.
- `SpellRepo` and `FeatRepo` against `:memory:`: create, update, limits, a
  damaged row filtered out, campaign selection.
- Route handlers with injected dependencies: the guard's refusals (no session,
  not DM, cross-origin, rate limit), every filter combination of search, bad
  query values answering 400, and paging.
- The migration applies on a copy of a current-schema database.

## Risks

- **Open5e data quality.** Fields like `damage_roll` are sometimes wrong, or
  attached to the wrong part of a spell. `CORRECTIONS` holds fixes, and the
  structured fields are a convenience on top of the text, which stays the
  authority.
- **Bundle size.** About 1 MB of extra JSON. Like the other SRD files it is
  imported only from `server-only` modules (`lib/dm/srdSpells.ts`), so it never
  reaches the browser. Today nothing checks that automatically
  (`verify-bundle.mjs` only looks for secrets), so add a check there: fail if a
  file under `.next/static` contains a marker string unique to the SRD data,
  such as the first spell's description.
