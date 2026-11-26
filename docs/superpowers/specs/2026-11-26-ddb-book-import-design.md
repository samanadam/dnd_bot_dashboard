# Importing owned D&D Beyond books into the portal: design

Status: draft for approval. Phase 1 covers monsters from the 2024 Monster Manual. Spells, items, other books and the 2014 books follow the same pipeline (see Phases).

## Intent

The DM owns many D&D Beyond books and wants to run the game from this portal instead of D&D Beyond. The portal only bundles SRD content (CC-BY-4.0). The DM wants the books they own available in the bestiary, encounter builder and combat tracker, with no duplicates of anything already bundled, nothing missing, and no risk to their D&D Beyond account.

## Goals

- Monsters from owned books appear in the Bestiary, the creature search, encounters and the combat tracker, exactly like SRD and custom monsters.
- Where a book monster is also bundled as SRD, the book copy wins and the SRD twin is hidden. One entry per monster, none lost.
- Importing is repeatable (running it twice changes nothing), previewable (dry run) and fully reversible (remove one book, or all imports, in one action).
- Phase 1 makes zero requests to D&D Beyond.

## Non-goals

- Spells, items, feats and the 2014 books in phase 1 (same pipeline, later).
- Any bypass of D&D Beyond's entitlement checks. The browser's own sign-in decides what is readable.
- Publishing or sharing imported content outside the portal. It lives only in the server database and stays DM-only, like custom monsters today.
- Editing imported monsters in place (copy to a custom monster to edit).

## Anti-goals (failure even if it "works")

- Any book text committed to the repository, test fixtures included.
- An import that flags the DM's D&D Beyond account.
- A silent merge or duplicate: every source entry must end in exactly one reported state.
- Bundled SRD data modified or deleted.

## Constraints from the existing code

- Creatures live in the `creatures` table as JSON validated by `statBlockSchema` (`lib/dm/statblock.ts`, strict). Custom monsters are DM-only and shared across campaigns.
- The Bestiary page merges custom creatures with `listSrd()`; creature search and the combat tracker resolve refs of the form `{source:"srd", edition, slug}` or `{source:"custom", id}`.
- The extension authenticates with a per-user bearer token (`ptx_...`) that reaches `/api/ext/*` only (`lib/ext/tokens.ts`, `lib/ext/routes.ts`), with rate limits and a bad-token limiter.
- Migrations are append-only in `lib/dm/db.ts`.
- Rule from `docs/security.md`: book content lives only in the server database.

## Approaches considered

1. **Extension calls D&D Beyond's internal data endpoints in bulk.** Complete and structured, but it is exactly the traffic pattern most likely to be flagged, the endpoints are undocumented and unverified, and the data is numeric ids that need big mapping tables. Rejected: worst for account safety.
2. **The extension or a script converts the pages and posts finished stat blocks.** Fewer server parts, but every converter fix needs an extension rebuild or a new capture. Rejected.
3. **Capture the book pages the DM already has open (or opens normally), send the raw page HTML to the portal, and let the portal convert it.** The page is already loaded by the browser, so there are no extra requests. The converter is plain tested server code and can be re-run on stored pages. **Chosen.** Proven on the 2024 Monster Manual: 27 pages, 503 stat blocks, all valid against `statBlockSchema`, 330 of the 331 SRD 2024 monsters matched by name.

## Design

### Pipeline

```
saved/open D&D Beyond book pages (HTML)
   -> client: script (phase 1) or extension content script (phase 2)
   -> POST /api/ext/library/pages  (bearer token, DM only)
   -> portal: validate, store raw page, convert, reconcile with SRD, write rows
   -> Bestiary / search / encounters / combat tracker
```

Both clients call the same route, so the script built first is replaced by the extension later without touching the server.

### 1. Converter (`lib/dm/ddbMonsters.ts`)

Pure function: page HTML in, `{ monsters: StatBlock[], ledger }` out. It reads text only; nothing from the page is rendered or stored as HTML. Mapping (verified on all 503):

| D&D Beyond | StatBlock |
|---|---|
| block heading | `name` |
| `Medium Elemental, Neutral` | `size` (first size if "X or Y"), `type` (keeps the subtype, e.g. "Fiend (Devil)"), `alignment` |
| `AC 16 Initiative +3 (13)` | `ac`, `initiativeBonus` |
| `HP 66 (12d8 + 12)` | `hp`, `hitDice` |
| `Speed` | `speed` |
| the two ability tables (Score, Mod, Save) | `abilities`; `saves` holds only abilities where Save differs from Mod (proficient) |
| `Skills` | `skills` (snake_case keys; a trailing parenthetical note is dropped) |
| `Senses`, `Languages` | `senses`, `languages` |
| `Immunities` | split into `damageImmunities` and `conditionImmunities` by the 15 condition names |
| `Resistances`, `Vulnerabilities` | `damageResistances`, `damageVulnerabilities` |
| `CR n (XP x; PB +p)` | `cr`, `xp` (the book's value, first figure), `proficiencyBonus` |
| `Gear` line | a trait named "Gear" (lossless; no field for it) |
| Traits / Actions / Bonus Actions / Reactions / Legendary Actions | the five feature lists; the legendary intro becomes `legendaryDescription` |
| a bold `Name.` or `Name (Recharge 5-6).` paragraph | one feature (markup varies; the name is the leading bold run ending in a period) |
| other paragraphs, lists, spell lines, d6 tables | appended as lines to the previous feature |
| `Attack Roll: +5 ... Hit: 7 (1d8 + 3) Slashing damage plus 2 (1d4) Fire damage` | `attack` (flat damage and a Unicode minus are handled) |

Dropped on purpose: lore text, Habitat and Treasure lines, alternate size, skill notes.

A block that fails `statBlockSchema` is not written; it is listed in the ledger as "needs review" with the reason.

### 2. Storage (migration, appended to `lib/dm/db.ts`)

- `creatures` gains `source TEXT` (e.g. `ddb:mm-2024`), `source_key TEXT` (the D&D Beyond monster id from the heading link, falling back to the heading anchor) and `supersedes TEXT` (e.g. `2024/aboleth`), with an index on `source` and a unique index on `(source, source_key)` where `source` is not null. Existing rows are unaffected.
- New table `library_pages (id, source, page, html, fetched_at)` keeps the raw pages so the converter can be re-run after a fix without touching D&D Beyond again. Capped at 50 MB total.

### 3. Reconcile with the SRD (book copy wins)

- Match key: lowercase alphanumerics of the name, within the same edition (`mm-2024` maps to edition 2024). One SRD monster per key.
- Match: the imported row stores `supersedes = "<edition>/<slug>"`. The Bestiary list, the creature search and the monster picker skip an SRD entry that some row supersedes. The SRD files and `getSrd` are untouched, so every existing encounter or reward that points at the SRD ref still resolves.
- No match: plain import.
- Two SRD candidates for one key, or any schema failure: "needs review", not written.
- Re-import updates the row with the same `(source, source_key)`; it never creates a second one.
- Removing a book deletes its rows; its SRD twins reappear automatically because nothing else changed.

Ledger for every run: `received = imported-new + updated + superseding-SRD + needs-review`. The counts must add up to the number of stat blocks found on the pages.

### 4. Route and safety (`/api/ext/library/pages`)

- Bearer token only, and the token's owner must pass the same DM check `guardDm` uses. A non-DM token gets the same 404 an unknown URL gets.
- Rate limited (own bucket, e.g. 60 pages per minute), body at most 2 MB, content type HTML, and the page must contain stat blocks, otherwise 422.
- `?dryRun=1` returns the ledger and writes nothing.
- Every write goes through zod `.strict()` schemas and bound SQL parameters; text is stored and shown as text.
- Audit log entry per request: counts and source only, never content.
- Remove: `DELETE /api/dm/library/sources/:source` (DM session, audited) deletes rows and raw pages for that source.

### 5. Clients

- **Phase 1: `scripts/import-ddb-pages.mts`.** Reads a folder of saved page HTML, posts each to the route with the DM's token, prints the ledger. `--dry-run` first, then the real run. Sends nothing to D&D Beyond.
- **Phase 2: extension content script** on `dndbeyond.com/sources/dnd/*`. Passive: a button on a book page sends the page the browser already loaded. An optional slow "walk the chapter list" mode (about one page every 5 seconds, stops on any 401, 403, 429 or captcha, hard page cap) comes only after the passive mode proves out.

### 6. UI (Bestiary)

- A source badge on imported monsters ("Monster Manual (2024)").
- A small DM-only "Imported books" panel: each source with its count and a Remove button with a confirmation.
- The Bestiary has a demo twin (`app/demo`); the demo shows the badge on a sample entry and no import controls.

## Account safety, concretely

- Phase 1 sends no request to D&D Beyond at all; the pages were already loaded in the DM's own browser session.
- Phase 2 passive mode adds no request either. Walk mode is opt-in, slow, sequential and self-stopping.
- No credentials or cookies leave the browser; the portal token only authorises writing to the portal.

## Testing

- Converter unit tests use synthetic HTML fixtures with invented monsters that copy the markup shapes seen (split bold names, period outside the tag, Unicode minus, flat damage, Gear, legendary intro, d6 table, spell lists). No real book text in the repository.
- An opt-in test runs over a local folder of captured pages when `DDB_PAGES_DIR` is set: every block must validate and the ledger must add up.
- Route tests: non-DM token, bad token, oversized body, wrong content, dry run writes nothing, re-import is idempotent, remove restores SRD visibility.
- Search/Bestiary tests: a superseded SRD entry is hidden, and its ref still resolves.

## Decisions made on the DM's behalf (change any of these)

1. Book copy wins over SRD; the SRD twin is hidden, not deleted.
2. `saves` stores proficient saves only (the SRD import stores all six).
3. Gear becomes a trait; alternate sizes and skill notes are dropped.
4. XP comes from the book (it differs from the SRD in about 27 cases, e.g. Archmage 8,000 vs 8,400).
5. Raw pages are kept in the database (50 MB cap) so fixes never need a re-capture; "Remove" deletes them too.
6. Only the 2024 Monster Manual in phase 1. The 2014 book needs a fresh capture and a converter variant.

## Phases

1. Monsters from the 2024 Monster Manual: converter, migration, route, SRD reconcile, script, Bestiary badge and Imported books panel.
2. Extension capture (passive), then optional walk mode.
3. Spells and feats, then items, each with its own converter on the same route and tables.
4. 2014 books (monsters first).

## Left to the builder

- Exact route and file names within the existing `lib/dm` and `lib/ext` layout.
- The page-size and rate-limit numbers, within the order of magnitude given.
- The wording of the ledger messages and the Imported books panel.
