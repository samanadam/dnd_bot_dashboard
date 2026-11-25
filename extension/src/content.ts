import { playRoll } from "./overlay";
import { parseRolls } from "./rolls";
import { characterIdFromPath, hpNotice, normalize } from "./state";

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

/** A small notice at the bottom of the page, with a Reload button. Text only, never HTML. */
function notice(text: string) {
  document.getElementById("portal-sync-notice")?.remove();
  const box = document.createElement("div");
  box.id = "portal-sync-notice";
  box.setAttribute("role", "status");
  box.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;display:flex;gap:10px;align-items:center;padding:10px 14px;border-radius:12px;background:#10121f;color:#eceefb;border:1px solid #a394ff;box-shadow:0 12px 32px -12px rgb(0 0 0 / .6);font:14px/1.4 system-ui,sans-serif";
  const label = document.createElement("span");
  label.textContent = text;
  const reload = document.createElement("button");
  reload.textContent = "Reload";
  reload.style.cssText = "all:unset;cursor:pointer;padding:5px 12px;border-radius:8px;background:#a394ff;color:#0d0a24;font-weight:600";
  reload.addEventListener("click", () => location.reload());
  const close = document.createElement("button");
  close.textContent = "×";
  close.setAttribute("aria-label", "Dismiss");
  close.style.cssText = "all:unset;cursor:pointer;padding:0 6px;color:#959bba;font-size:18px";
  close.addEventListener("click", () => box.remove());
  box.append(label, reload, close);
  document.body.append(box);
}

// The portal's HP change is saved on D&D Beyond, but this page shows it only after a reload: a page in
// the background reloads when it is looked at again; one in front shows a notice instead of reloading
// under the player.
let reloadWhenShown = false;
chrome.runtime.onMessage.addListener((message: { type?: string; write?: Parameters<typeof hpNotice>[0] }) => {
  if (message.type !== "hpSaved" || !message.write) return;
  if (document.visibilityState === "visible") notice(hpNotice(message.write));
  else reloadWhenShown = true;
});
document.addEventListener("visibilitychange", () => {
  if (reloadWhenShown && document.visibilityState === "visible") location.reload();
});

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
