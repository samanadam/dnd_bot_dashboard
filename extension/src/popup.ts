import { EMPTY_STATE, portalOrigin, type SyncState } from "./state";

const KEY = "sync";
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function load(): Promise<SyncState> {
  const stored = (await chrome.storage.local.get(KEY))[KEY] as Partial<SyncState> | undefined;
  return { ...EMPTY_STATE, ...stored, characters: { ...(stored?.characters ?? {}) } };
}

function say(text: string, bad = false) {
  const status = $("status");
  status.textContent = text;
  status.className = bad ? "err" : "";
}

async function render() {
  const state = await load();
  $<HTMLInputElement>("url").value = state.portalUrl ?? "";
  $<HTMLInputElement>("token").value = state.token ? "••••••••" : "";
  const list = $("characters");
  list.textContent = "";
  for (const [id, entry] of Object.entries(state.characters)) {
    const row = document.createElement("li");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = entry.enabled;
    box.addEventListener("change", async () => {
      const fresh = await load();
      if (fresh.characters[id]) fresh.characters[id].enabled = box.checked;
      await chrome.storage.local.set({ [KEY]: fresh });
    });
    const text = document.createElement("span");
    text.textContent = ` Character ${id}: ${entry.lastError ?? (entry.lastSyncAt ? `synced ${new Date(entry.lastSyncAt).toLocaleTimeString()}` : "waiting")}`;
    if (entry.lastError) text.className = "err";
    row.append(box, text);
    list.append(row);
  }
}

$("save").addEventListener("click", async () => {
  const origin = portalOrigin($<HTMLInputElement>("url").value);
  if (!origin) return say("Enter the portal address, starting with https://", true);
  const typed = $<HTMLInputElement>("token").value.trim();
  const state = await load();
  // The permission prompt needs this click, so it comes first.
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) return say("The extension needs permission to reach the portal.", true);
  state.portalUrl = origin;
  if (typed && !typed.startsWith("•")) state.token = typed;
  await chrome.storage.local.set({ [KEY]: state });
  void chrome.action.setBadgeText({ text: "" });
  say("Saved.");
  await render();
});

$("test").addEventListener("click", async () => {
  const answer = (await chrome.runtime.sendMessage({ type: "ping" })) as { ok: boolean; text: string };
  say(answer.text, !answer.ok);
});

void render();
