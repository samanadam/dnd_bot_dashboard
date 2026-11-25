# Portal D&D Beyond sync (browser extension)

Shows your D&D Beyond character in the portal, live, and replays your D&D Beyond rolls with the portal's 3D dice. Chrome and Edge only.

## Install

1. `npm run build:extension`. This writes `extension/dist/`.
2. Open `chrome://extensions` (or `edge://extensions`), turn on Developer mode, choose **Load unpacked**, pick `extension/dist`.
3. In the portal open **Settings, D&D Beyond sync** and press **Connect this browser**. The portal makes a token and hands it to the extension; nothing to copy. (This works on the portal site the extension was built for, `https://dcdashboard.yangil.net` or `STORE_PORTAL`, and on `localhost`.)
4. Elsewhere, pair by hand: make a token under **Pair by hand** (shown once), then in the extension open **Settings** and enter the portal address and the token, **Save and test**.
5. Open your character on D&D Beyond once. With live sync on, it appears in the portal within seconds as a sheet marked "Synced from D&D Beyond", in the campaign D&D Beyond says it is in (matched by name). If the portal cannot tell, the pairing page lists the character under "Waiting for a campaign" and you choose one; you can change it later.

## What it does

- **Live sync is the player's own switch.** In the popup press **Start live sync** when you sit down to play and **Stop** when you are done. While it is on, the background script reads every character you have opened every 30 s (or 60 s, in Settings), with no D&D Beyond tab open, as long as you are signed in to D&D Beyond in this browser. An open character page also refreshes straight away after an edit. It turns itself off whenever the browser starts. While it is on the portal shows you as **Live** on your sheet and on the party cards; otherwise as **Offline**, with a note telling the table to ask you to start it. **Sync all once** and each character's **Sync now** work any time.
- It uses your own D&D Beyond session. The short-lived D&D Beyond token is kept for the browser session only, never stored on disk, and never sent to the portal. The raw character goes to the portal, which reads it (`lib/ddb/map.ts`).
- **Start it without thinking:** a keyboard shortcut (Alt+Shift+L by default, change it at `chrome://extensions/shortcuts`), and an option to start live sync whenever you open one of your characters on D&D Beyond.
- **The popup** shows whether you are live and for how long, updates and rolls this session, each character with portrait, class, HP bar, last sync and any problem, buttons to sync now or open that exact sheet in the portal, and your last five rolls.
- **The Settings page** holds the connection (with Disconnect), live sync and its interval, auto-start, switches for rolls and the 3D dice, a per-character on/off, an activity log, and a short how-it-works.
- **The portal knows the extension is there:** the extension has a small script on the portal's own pages that answers "installed? connected? live?" and accepts a token only from that portal site (checked against the manifest).
- **Other players' characters**: a character you open but cannot edit on D&D Beyond (a friend's, through a shared campaign) is kept under "Other players", hidden from the popup by default and never sent. Every character has a "Show in popup" switch in Settings, and a Hide button in the popup.
- **Open sheet** goes straight to that character's sheet in the portal, yours or (in a campaign you play in) a friend's (`GET /api/ext/sheet`).
- **Two-way HP**: on a synced sheet the portal takes damage, healing, temp HP and death saves (the sheet page and the battle screen). The portal keeps the change as what D&D Beyond should hold; the owner's extension, while live sync is on, saves it with D&D Beyond's own calls (`character/v5/life/hp/damage-taken` and `life/death-saves`) and syncs again, and the portal forgets it once D&D Beyond holds it. A change not saved within 10 minutes is dropped and D&D Beyond wins. Off switch in Settings ("Let the portal change my HP on D&D Beyond").
- Everything else on a synced sheet is read-only in the portal, for everyone (conditions, inspiration, slots, resources, the sheet itself). Change it in D&D Beyond.
- Rolls made in a campaign game are thrown again over the page with the portal's dice, and posted to the bot's roll feed. Rolls made outside a campaign are not sent anywhere by D&D Beyond, so they are not seen.

## Not in this version

Write-back to D&D Beyond, Firefox/Safari, AboveVTT-specific features.

## Finding out what D&D Beyond does

`DIAG=1 npm run build:extension` builds a version that logs, with the prefix `[portal-diag]` in the page console, every WebSocket it opens or sends on, the XHR and beacon calls that look like game-log or dice traffic, and any Web Worker it starts (names and shapes only, never character data). Reload the extension, reload the character page, act, read the console. Never ship that build: a normal build compiles all of it out.

## When D&D Beyond changes something

The data format is unofficial. If a sheet stops updating, the popup and the portal's pairing page show the error and the last good sheet stays. The fix is in `lib/ddb/map.ts` (data) or `extension/src/page.ts` and `extension/src/rolls.ts` (rolls). Fixtures are in `tests/fixtures/ddb/`; notes on what was observed are in `docs/superpowers/specs/ddb-capture-notes.md`.
