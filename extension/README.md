# Portal D&D Beyond sync (browser extension)

Shows your D&D Beyond character in the portal, live, and replays your D&D Beyond rolls with the portal's 3D dice. Chrome and Edge only.

## Install

1. `npm run build:extension`. This writes `extension/dist/`.
2. Open `chrome://extensions` (or `edge://extensions`), turn on Developer mode, choose **Load unpacked**, pick `extension/dist`.
3. In the portal open **Settings, D&D Beyond sync**, make a token (one per browser, tied to one campaign) and copy it. It is shown once.
4. Click the extension icon, enter the portal address and the token, **Save** (the browser asks to let the extension reach the portal), then **Test**.
5. Open your character on D&D Beyond. Within seconds it appears in the portal as a sheet marked "Synced from D&D Beyond".

## What it does

- Reads your character the way the D&D Beyond page does, using your own logged-in session. The short-lived D&D Beyond token stays in the page's memory. The extension never stores your D&D Beyond login and never sends it to the portal.
- Sends the raw character data to the portal, which reads it (`lib/ddb/map.ts`). It updates every 15 s while the tab is visible, and straight away when you change something on the page.
- A synced sheet is read-only in the portal, for everyone. Change it in D&D Beyond.
- Rolls made in a campaign game are thrown again over the page with the portal's dice, and posted to the bot's roll feed. Rolls made outside a campaign are not sent anywhere by D&D Beyond, so they are not seen.

## Not in this version

Write-back to D&D Beyond, Firefox/Safari, inventory, spell and feature detail, AboveVTT-specific features.

## When D&D Beyond changes something

The data format is unofficial. If a sheet stops updating, the popup and the portal's pairing page show the error and the last good sheet stays. The fix is in `lib/ddb/map.ts` (data) or `extension/src/page.ts` and `extension/src/rolls.ts` (rolls). Fixtures are in `tests/fixtures/ddb/`; notes on what was observed are in `docs/superpowers/specs/ddb-capture-notes.md`.
