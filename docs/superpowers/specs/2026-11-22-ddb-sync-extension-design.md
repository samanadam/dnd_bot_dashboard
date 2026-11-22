# D&D Beyond sync extension: design

## Intent

At a live game, players run their characters in D&D Beyond (often with AboveVTT on top). The portal, the DM view and the Discord bot should see that same character live, without anyone retyping it. D&D Beyond is the single source of truth. The portal mirrors it. Our 3D dice (the portal's own design) animate D&D Beyond's rolls.

Why an extension: D&D Beyond has no public API. A browser extension running on the player's own D&D Beyond page, with the player's own login, is the one route that works without handling their credentials. AboveVTT reads the same page and data, so the two run side by side with nothing to integrate.

## Goals

- A Chrome/Edge (Manifest V3) extension that, on a D&D Beyond character page, reads the character and pushes it to the portal whenever it changes.
- Portal shows a synced character as a normal sheet (DM view, battle view, bot lookups keep working), marked "synced from D&D Beyond" and read-only for the synced fields.
- Rolls made in D&D Beyond are replayed on that page with the portal's 3D dice (same skins and physics as `lib/dice` and `components/dice`). D&D Beyond decides the result. Our dice only display it.
- One-time pairing between the extension and a portal account. The token is revocable.

## Non-goals (v1)

- Writing anything back to D&D Beyond (no DM-applied damage or healing on synced sheets; the portal rejects vitals ops on them with a clear message).
- Firefox, Safari, mobile.
- Hooking AboveVTT internals (tokens, maps, its own roll flow). Possible later, on top of this.
- Inventory, spell list and feature details. v1 covers identity, class/level, ability scores, AC, HP/temp HP/max, death saves, spell slots, conditions, exhaustion, inspiration, concentration where D&D Beyond exposes it.
- Server push to portal viewers (the portal has none; see Constraints).
- Importing sheets from PDF. Chrome Web Store listing.

## Anti-goals

- Never store or forward D&D Beyond cookies or credentials.
- Never overwrite portal data silently. Only sheets created by sync are synced, and the portal shows they are.
- Never fail quietly when D&D Beyond changes its data shape. A parse failure must keep the last good sheet, show a visible error in the extension (badge and popup), and report a coarse error to the portal.

## Constraints

- Unofficial data. The character JSON comes from D&D Beyond's own page requests. The format can change without notice and using it may sit outside their terms of service. Keep all parsing in one module with fixtures so a break is a one-file fix. The user should know this risk.
- Portal has no server push (see the players spec, non-goals). "Live" means the extension pushes on every change and portal pages pick it up through their normal refresh.
- Portal rules apply: every input validated with zod, `x-portal-request` session API is for browsers on the portal, so the extension gets its own bearer-token API. CSP is `frame-ancestors 'none'`, so the dice cannot be an iframe of a portal page.
- Sheets carry `version` and `vitals_version` with conflict detection. Synced sheets bypass the player-edit path and are written by the sync endpoint only.

## Approaches considered

- **A. Own extension reading D&D Beyond (chosen).** Independent of AboveVTT, uses the player's login, simplest trust story. Cost: depends on D&D Beyond's unofficial data format.
- **B. Build on AboveVTT.** Richer (map, tokens) but couples to its internals and only works while it runs. Kept as a possible later add-on.
- **C. Manual push (bookmarklet).** Not live. Rejected.

## Design

### Extension (`extension/` in this repo)

- Content script on `https://www.dndbeyond.com/characters/*`, plus a page-world script.
- Getting the character: preferred is observing the character response D&D Beyond's own page already fetches (no extra requests). Fallback is fetching the same character endpoint from the content script with the user's session, on a slow poll (about 15 s) while the tab is visible. Builder confirms which works reliably.
- Getting rolls: observe D&D Beyond's game log / roll events on the page, extract per-die results (kind and face, including d100 as tens plus d10, matching `ShownDie` in `lib/dice/shown.ts`), and replay them with the overlay.
- Overlay: bundle the portal's dice code into the extension (esbuild) so skins and physics stay in one place. Builder checks that `components/dice/scene.ts` and `lib/dice` are importable outside Next.
- Popup: pairing token entry, connection state, last sync time, last error, per-character on/off.
- Storage: token in `chrome.storage.local`. Permissions limited to the D&D Beyond host and the portal host.
- Distribution v1: unpacked or zip served from the portal. Store listing later.

### Portal

- Pairing: signed-in user generates a token in the portal (shown once, stored hashed, revocable, listed with last-used time). Scoped to the extension endpoints only.
- Endpoints, bearer-token only, zod-validated, rate-limited, CORS limited to the extension origin:
  - `POST /api/ext/sheets/sync`: body is the normalized character plus its D&D Beyond character id.
  - `POST /api/ext/rolls`: a finished roll (label, total, dice).
- Link table: portal sheet id, D&D Beyond character id, owner user, last sync, last error. First sync for an unknown character creates a synced sheet in the player's current campaign. Later syncs update it.
- Mapper (`lib/ddb/`): D&D Beyond JSON to `SheetBody` and `Vitals`, one module, fixture-tested. Fields D&D Beyond cannot supply get defaults and are flagged.
- Synced sheets: `source = "ddb"`. Player edits and vitals ops are rejected for synced fields. DM notes and portrait stay editable in the portal.
- Rolls: stored in a short recent-rolls list and relayed to the Discord bot if the existing bot client already has a way to post (builder decides how).
- UI: "Synced from D&D Beyond" badge on the sheet, a pairing and token page, last-sync and error status.

## Tests

Mapper tests against sanitized sample character JSON (several classes, a caster, a multiclass). Token tests (hash, revoke, scope). Endpoint tests for validation and rejection of vitals ops on synced sheets. Extension parsing tested on the same fixtures, and a manual run against a real D&D Beyond page.

## Left to the builder

- Capturing the character data (observe or poll) and the roll events, after a short spike on a real page.
- How the dice bundle is built and shared.
- How rolls reach Discord, if at all in v1.
- Exact D&D Beyond field mapping and how to flag unmapped fields.
- Token page layout (follow existing portal settings pages).

## Calls made without asking

- Chrome/Edge MV3 only.
- First sync auto-creates the synced sheet in the player's current campaign.
- Synced fields are strictly read-only in the portal, including for the DM.
- Polling fallback of about 15 s, only while the tab is visible.
- Extension lives in `extension/` in this repo.
