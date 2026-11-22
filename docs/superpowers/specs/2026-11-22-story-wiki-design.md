# Story: linked notes and a brain map in the DM Screen

## Intent
The next campaign has a new DM, and the portal has mostly been a combat tool. The DM prepares the story too, so the DM Screen gets a **Story** section: free-form linked notes (places, factions, NPCs, events, secrets, plot threads) that the DM writes and rearranges in the browser, drawn as a brain map. It grows with the campaign. The previous DM (the requester) wants the incoming one to have a strong story-prep home from day one.

## Goals
- A **Story** entry in the DM Screen nav, with a sub-nav inside it: Overview, Notes, Map. Later views (Plot threads, Timeline, Secrets) are filtered views of the same notes, not new data.
- Create, edit, search and delete notes. Each has a title, a type, tags and a Markdown body. `[[Title]]` links to another note.
- A **Map**: every note is a node, every `[[link]]` an edge, coloured by type. Click a node to read it; drag, pan, zoom, search. Same look and feel as the Auren vault.
- Backlinks on every note; unresolved links shown and one click to create the missing note.
- Per-campaign, like Areas and NPCs: notes belong to a campaign and obey the DM's campaign scope. Co-DMs share them.
- Empty state offers a starter set (Premise, Factions, Secrets and clues, Session log) so a new DM is not facing a blank page.
- Live: saved to the portal database, no deploy.

## Non-goals (this round)
- Player-facing view or per-note reveal flags. Story is DM-only. Players keep the static vaults.
- Image upload, attachments, rich text editor, real-time co-editing.
- Linking notes to areas, NPCs, encounters or sounds. Planned next (a note's optional "refs"), kept out so the first version ships small.
- Plot-thread, timeline and secrets views. They come after the wiki and map exist.
- Importing an Obsidian vault.

## Anti-goals
- A rigid arc → chapter → scene hierarchy that boxes the DM in.
- Notes visible to anyone who is not a DM, even by guessing a URL.
- Losing a note to two tabs overwriting each other (areas already guard this; do the same).

## Constraints (from the codebase)
- Next.js 16 (read `node_modules/next/dist/docs/` before writing pages). Pages sit under `app/(portal)/dm/…`; every page calls `requireDm()`.
- SQLite via `lib/dm/db.ts` migrations (`PRAGMA user_version`). Repos in `lib/dm/*.ts` take a `DatabaseSync`; routes are factory functions in `lib/dm/*Routes.ts` behind `guardDm`, thin files in `app/api/dm/…`. Follow `areas.ts` / `areaRoutes.ts`: zod `.strict()` schemas, `version` for conflicts, `campaignClause` for scope, audit log on writes.
- The CSP and `proxy.ts` rules stay as they are; these pages are signed-in only.
- The demo (`/demo`) mirrors every DM page with in-memory data (`lib/demo/*`, `tests/demo.test.ts`). Story needs a demo twin and fixtures, and must not import server-side code.
- The nav is `lib/tools/registry.ts` (flat `links`, each with a permission); home tiles are in `DmHomeView`.

## Approaches considered
1. **Linked-notes wiki plus a graph.** Flexible, fits any DM's style, grows over time. Chosen as the base.
2. **Structured plot tools** (arcs, chapters, scenes, clues, timeline as fixed pages). Guiding but boxes a new DM in.
3. **Both: wiki as the base, filtered Story sub-pages on top.** **Chosen by the requester**, starting with wiki and map only.

## Design
**Data.** One table `story_notes`: `id` (uuid), `campaign_id` (nullable, like areas), `title` (1–120), `type` (`place | npc | faction | event | secret | plot | session | other`), `tags` (JSON array, ≤12, ≤32 chars), `body` (≤50 000), `version`, `created_at`, `updated_at`. Links are **not stored**: they are read out of `[[Title]]` in bodies when a note or the map is loaded (a campaign has hundreds of notes, not millions). Titles are unique per campaign, case-insensitive, which is what makes `[[Title]]` resolve. Renaming a note rewrites matching links in other notes in the same transaction. Limit 2 000 notes per campaign.

**API** (`/api/dm/story/notes`, factories in `lib/dm/storyRoutes.ts`): `GET` list (summaries plus extracted link ids for the map), `POST` create; `/[id]` `GET`, `PUT` (with `version`, 409 on conflict), `DELETE`; `POST /starter` fills an empty campaign. All behind `guardDm` with campaign scope and the audit log.

**Pages.** `/dm/story` (Overview: recent notes, counts by type, open `[[links]]` that point nowhere, a small map), `/dm/story/notes` (list, search, filter by type and tag), `/dm/story/notes/[id]` (read view with backlinks, edit view: title, type, tags, Markdown textarea with preview), `/dm/story/map` (full-height graph; the side panel shows the note). A `layout.tsx` under `dm/story` renders the sub-nav.

**Auren stays separate (requester's call).** The Auren vault (`/vault/auren`, `components/vault`, `lib/vault`, `scripts/build-vault.mjs`) is not touched. Story gets its own code under `components/dm/story/` and `lib/dm/story*.ts`: a small Markdown renderer that reads the body at render time (no build step), and its own graph component adapted from `VaultGraph`, styled with the portal theme tokens. Some duplication is accepted so the two can change independently.

**Nav.** Add `{ href: "/dm/story", label: "Story", icon, permission: "dm" }` to the DM tool, a tile on the DM home, and `/demo/dm/story…` pages backed by demo fixtures.

**Errors and edge cases.** Duplicate title: 409 with a clear message. Deleting a note leaves `[[links]]` to it in other notes; they show as unresolved. Body is rendered through the existing safe block renderer, never as HTML. A bad or foreign-campaign id is a 404.

## Testing
Repo tests (create, unique title, rename rewrites links, limits, version conflict, campaign scoping), route tests in the style of `area-routes.test.ts` (guard, scope, 409), link-extraction unit tests, a UI test for the editor, the demo test extended for the new pages, and the existing vault test still passing.

## Left to the builder
Exact icon, copy and starter-note text; whether `[[` autocomplete ships in the first pass (nice, not required); how much of the Markdown subset to support (headings, lists, bold/italic, links, wikilinks, tables are enough); map layout tuning for large campaigns.
