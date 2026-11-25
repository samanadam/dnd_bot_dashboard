# Portal D&D Beyond sync (browser extension)

Shows your D&D Beyond character in the portal, live, and replays your D&D Beyond rolls with the portal's 3D dice. Chrome and Edge only.

## Install

1. `npm run build:extension`. This writes `extension/dist/`.
2. Open `chrome://extensions` (or `edge://extensions`), turn on Developer mode, choose **Load unpacked**, pick `extension/dist`.
3. In the portal open **Settings, D&D Beyond sync**, make a token (one per browser, good for every campaign you play in) and copy it. It is shown once.
4. Click the extension icon, then **Settings** (or **Connect to your portal**). Enter the portal address and the token, **Save and test** (the browser asks to let the extension reach the portal).
5. Open your character on D&D Beyond once. With live sync on, it appears in the portal within seconds as a sheet marked "Synced from D&D Beyond", in the campaign D&D Beyond says it is in (matched by name). If the portal cannot tell, the pairing page lists the character under "Waiting for a campaign" and you choose one; you can change it later.

## What it does

- **Live sync is the player's own switch.** In the popup press **Start live sync** when you sit down to play and **Stop** when you are done. While it is on, the background script reads every character you have opened every 30 s (or 60 s, in Settings), with no D&D Beyond tab open, as long as you are signed in to D&D Beyond in this browser. An open character page also refreshes straight away after an edit. It turns itself off whenever the browser starts. While it is on the portal shows you as **Live** on your sheet and on the party cards; otherwise as **Offline**, with a note telling the table to ask you to start it. **Sync all once** and each character's **Sync now** work any time.
- It uses your own D&D Beyond session. The short-lived D&D Beyond token is kept for the browser session only, never stored on disk, and never sent to the portal. The raw character goes to the portal, which reads it (`lib/ddb/map.ts`).
- The Settings page holds the connection, the live interval, switches for rolls and the 3D dice, a per-character on/off, and a short activity log.
- A synced sheet is read-only in the portal, for everyone. Change it in D&D Beyond.
- Rolls made in a campaign game are thrown again over the page with the portal's dice, and posted to the bot's roll feed. Rolls made outside a campaign are not sent anywhere by D&D Beyond, so they are not seen.

## Not in this version

Write-back to D&D Beyond, Firefox/Safari, AboveVTT-specific features.

## Finding out what D&D Beyond does

`DIAG=1 npm run build:extension` builds a version that logs, with the prefix `[portal-diag]` in the page console, every WebSocket it opens or sends on, the XHR and beacon calls that look like game-log or dice traffic, and any Web Worker it starts (names and shapes only, never character data). Reload the extension, reload the character page, act, read the console. Never ship that build: a normal build compiles all of it out.

## When D&D Beyond changes something

The data format is unofficial. If a sheet stops updating, the popup and the portal's pairing page show the error and the last good sheet stays. The fix is in `lib/ddb/map.ts` (data) or `extension/src/page.ts` and `extension/src/rolls.ts` (rolls). Fixtures are in `tests/fixtures/ddb/`; notes on what was observed are in `docs/superpowers/specs/ddb-capture-notes.md`.
