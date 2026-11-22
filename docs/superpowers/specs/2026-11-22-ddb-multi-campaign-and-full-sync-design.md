# D&D Beyond sync: several campaigns, everything on the sheet, working rolls

Follows `2026-11-22-ddb-sync-extension-design.md` (the extension as shipped in 0.1.0) and the findings in `ddb-capture-notes.md`.

## Why

Playing with the first version showed three gaps:

1. A browser can pair with **one campaign** (the token is tied to it). A player with characters in two campaigns cannot sync both, and pairing against the wrong campaign silently puts the sheet in the wrong place. Changing the token later does not move the sheet.
2. The sheet shows combat numbers only. The player wants **everything** D&D Beyond holds on the portal's sheet: spells, inventory, features and traits, notes and story.
3. Roll replay never fired, because D&D Beyond sends a finished roll out over its game log socket and never receives it back.

D&D Beyond stays the source of truth. The portal sheet stays read-only for synced characters.

## What is already settled (from live captures)

- A character carries its D&D Beyond campaign: `data.campaign { id, name, dmUsername, ... }` (absent when the character is in no campaign).
- A finished roll is sent as a JSON frame on `wss://game-log-api-live.dndbeyond.com/v1` with `eventType: "dice/roll/fulfilled"`. Hooking the outgoing `send` is what sees it. Fixed on a branch; ships as 0.1.1.
- The raw character already contains everything below (spell lists, 20 inventory items with definitions, currencies, class actions, notes, traits, feats). The extension already sends all of it; only the portal mapper changes.
- A sheet's campaign is chosen when the sheet is created. A later sync with another token never moved it.

## Goals

- One token per person, valid for every campaign the person plays in. Pairing the wrong campaign becomes impossible, not just fixable.
- Each synced character lands in the right portal campaign without the player choosing, in the common case.
- If a character is moved (D&D Beyond campaign changed, or the player corrects the portal choice), its sheet moves with it, history kept.
- Every part of the D&D Beyond sheet the portal can show is synced, read-only.
- Rolls replay with the portal dice and reach the roll feed of the character's own campaign.

## Non-goals

- Writing anything back to D&D Beyond, including rolls from the portal into D&D Beyond's game log. Separate project, behind a switch, after this one.
- Syncing characters the player has not opened (the extension reads the open page). A "sync all my characters" list is a later option.
- Firefox or Safari.

## Approaches considered

**A. Keep per-campaign tokens, add a second token per campaign.** Smallest change, but a player juggles tokens and the extension would have to know which to use per page. Rejected: it keeps the trap.

**B. Campaign-less tokens; the portal resolves the campaign from the character's D&D Beyond campaign.** One token. The server already receives the whole character, so it needs no extension update. Chosen.

**C. The extension asks the player to pick a campaign in its popup.** More UI in a place we cannot easily test, and it still needs a server rule. Rejected as the primary path; the portal's pairing page is the fallback for the rare unresolved case.

## Design

### 1. Tokens

New tokens carry no campaign. Existing tokens keep working (they are treated as "any campaign the owner plays in"; the stored campaign is ignored). The pairing page drops the campaign picker. The extension is unchanged.

### 2. Resolving a character's campaign (server, on every sync)

A per-user table maps a D&D Beyond campaign id to a portal campaign: `ddb_campaign_map(user_id, ddb_campaign_id, campaign_id)`. On a sync the server decides, in order:

1. The character's D&D Beyond campaign id has a map row: use it.
2. Else the D&D Beyond campaign **name** equals (trimmed, case-insensitive) the name of a portal campaign the player plays in: use it and store a map row.
3. Else the player plays in exactly **one** portal campaign: use it (also for characters in no D&D Beyond campaign) and store a row.
4. Else the sync answers `409 needs_campaign` with the candidate campaigns, records the character as **pending**, and the pairing page lists it with a campaign dropdown. Choosing stores the map row and the next sync creates or moves the sheet.

Characters in no D&D Beyond campaign use a map row keyed by a reserved id (so the player picks once).

A synced sheet whose resolved campaign differs from the one it sits in is **moved** (the sheet row's campaign changes; vitals, id and link stay). Rolls are relayed to the campaign the character's link currently points at, not to the token's.

The pairing page shows, for each synced character: name, portal campaign, last sync, and a "Change campaign" dropdown (writes the map row and moves the sheet on the next sync).

### 3. Full sheet mapping (`lib/ddb/map.ts`, server only)

New fields filled on every sync, replacing what was there (the sheet is read-only):

| Portal field | From D&D Beyond | Notes |
|---|---|---|
| `features`, `feats` | class, species, background and feat actions/options with their descriptions | `source` set to the class or species name; HTML stripped to text, 20 000 characters at most |
| `inventory.items`, `currency` | `inventory[]` (name, qty, weight, equipped, attuned, container, notes) and `currencies` | items beyond 300 dropped with a warning |
| `spellcasting.entries` | class spell lists, racial and feat spells, each with prepared/known/always | matched to the SRD library by name to build the `ref`; see Open choice |
| `proficiencies.armor/weapons/tools/languages` | proficiency modifiers | text lists |
| `combat.speed/senses/resistances/immunities/vulnerabilities` | race speeds, senses and damage modifiers | |
| `backstory.*`, `identity.*` (age, height, eyes, hair, skin, faith, pronouns) | `traits`, `notes`, `age`/`height`/... | free text, each capped at the portal's limit |
| `combat.attacks` | not synced | the portal derives attacks from items and features; copying D&D Beyond's computed attack list would go stale |

Every field degrades to empty plus a warning when the shape is unexpected; the mapper never throws. A fixture of a real character with the shape of the live data (names and text replaced) pins each area, as the existing fixtures do.

### 4. Release

Extension 0.1.1: the roll fix (outgoing frame hook), no diagnostics in the build, no other change. Store review applies again. The server-side parts (sections 1 to 3) deploy on their own and need no extension update.

### 5. Health

The popup and the pairing page already show the last error per character. Add the resolved portal campaign and a `pending campaign` state to that list, so an unsynced character always says why.

## Open choice

**Spells D&D Beyond has but the SRD library does not** (most non-SRD spells): a sheet spell entry needs a library reference. Default for now: matched spells become entries; unmatched ones are listed by name under a "Spells from D&D Beyond not in the library" heading in the sheet's notes, so nothing is lost and nothing is invented. Importing them as the DM's custom spells is a later step.

## Build order

1. Campaign resolution, the map table, moving sheets, pairing-page changes, relay to the link's campaign. (Fixes the trap; no extension release.)
2. Full mapping, one area at a time (inventory and currency, features and feats, spells, backstory and identity, proficiencies and senses), each against a fixture and a live comparison.
3. Extension 0.1.1 and store update.
4. Later: portal-to-D&D Beyond rolls behind a switch; sync of characters not open.

## Risks

- D&D Beyond's data and game log are unofficial and can change. The mapper and the page hook are the two places to fix, and the health display shows which.
- Matching a campaign by name is a heuristic. A wrong guess is visible (the pairing page shows it) and correctable in one click, and the guess is only made when exactly one name matches.
- The raw character is 600 KB or more. The proxy and route already allow 4 MB; a trimmed payload is a possible later optimisation.
