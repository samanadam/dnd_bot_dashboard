import { playRoll } from "./overlay";
import { parseRolls } from "./rolls";
import { characterIdFromPath, normalize } from "./state";

// Runs on a D&D Beyond character page. It no longer reads the character itself: the
// background script does that on a timer, tab or no tab. This script tells it which
// character the player opened, asks for a refresh right after an edit (and every 15 s
// while the tab is in front), and replays the rolls it sees on this page.

const id = characterIdFromPath(location.pathname);
let timer: ReturnType<typeof setTimeout> | undefined;

const refresh = () => void chrome.runtime.sendMessage({ type: "refresh", id }).catch(() => undefined);

function schedule(delay: number) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (document.visibilityState === "visible") refresh();
    schedule(15_000);
  }, delay);
}

// The same message can arrive twice (reconnects); each one is thrown once.
const seen: string[] = [];

async function handleRoll(message: { id?: string }): Promise<void> {
  if (message.id) {
    if (seen.includes(message.id)) return;
    seen.push(message.id);
    if (seen.length > 50) seen.shift();
  }
  const settings = normalize((await chrome.storage.local.get("sync")).sync as never).settings;
  for (const roll of parseRolls(message)) {
    if (roll.ddbCharacterId !== id) continue;
    if (settings.replayRolls) void chrome.runtime.sendMessage({ type: "roll", roll: { ...roll, dice: undefined } });
    if (settings.overlay) await playRoll(roll.dice);
  }
}

if (id) {
  void chrome.runtime.sendMessage({ type: "seen", id }).catch(() => undefined);
  schedule(15_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "portal-ddb") return;
    if (event.data.type === "changed") schedule(1500);
    if (event.data.type === "roll") void handleRoll(event.data.message);
  });
}
