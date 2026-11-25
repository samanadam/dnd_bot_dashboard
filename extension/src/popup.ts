import { el } from "./ui";
import { ago, normalize, type CharacterState, type SyncState } from "./state";

const KEY = "sync";
const app = document.getElementById("app") as HTMLElement;

const load = async (): Promise<SyncState> => normalize((await chrome.storage.local.get(KEY))[KEY] as never);
const ask = <T,>(message: object) => chrome.runtime.sendMessage(message) as Promise<T>;

function card(id: string, entry: CharacterState, state: SyncState, busy: Set<string>, redraw: () => void): HTMLElement {
  const tone = entry.lastError ? (entry.needsCampaign ? "warn" : "bad") : entry.lastSyncAt ? "ok" : "muted";
  const status = !entry.enabled ? "Paused" : (entry.lastError ?? (entry.lastSyncAt ? `Synced ${ago(entry.lastSyncAt, Date.now())}` : "Waiting for the first sync"));
  const sync = el("button", { class: "small", textContent: busy.has(id) ? "Syncing..." : "Sync now", disabled: busy.has(id) || !entry.enabled });
  sync.addEventListener("click", async () => {
    busy.add(id);
    redraw();
    await ask({ type: "syncNow", id }).catch(() => undefined);
    busy.delete(id);
    redraw();
  });
  const actions = el("div", { class: "actions" }, sync);
  if (state.portalUrl) actions.append(el("a", { class: "button small", href: `${state.portalUrl}/play`, target: "_blank", rel: "noreferrer", textContent: "Open portal" }));
  return el("li", { class: "card char" }, el("strong", { textContent: entry.name ?? `Character ${id}` }), el("div", { class: tone, textContent: status }), actions);
}

async function render(busy = new Set<string>()) {
  const state = await load();
  const redraw = () => void render(busy);
  const paired = Boolean(state.portalUrl && state.token);
  const problems = Object.values(state.characters).filter((c) => c.enabled && c.lastError).length;
  const pill = el("span", { class: `pill ${!paired ? "muted" : problems ? "bad" : "ok"}`, textContent: !paired ? "Not connected" : problems ? `${problems} problem${problems > 1 ? "s" : ""}` : "Syncing" });

  const header = el("header", { class: "row" }, el("img", { src: "icons/icon-48.png", alt: "" }), el("div", { class: "grow" }, el("h1", { textContent: "Portal sync" }), el("div", { class: "muted", textContent: paired ? new URL(state.portalUrl as string).host : "D&D Beyond to your portal" })), pill);
  const settings = el("button", { class: "small", textContent: "Settings" });
  settings.addEventListener("click", () => void chrome.runtime.openOptionsPage());

  const body: HTMLElement[] = [];
  const ids = Object.keys(state.characters);
  if (!paired) {
    const connect = el("button", { class: "primary", textContent: "Connect to your portal" });
    connect.addEventListener("click", () => void chrome.runtime.openOptionsPage());
    body.push(el("div", { class: "card" }, el("p", { textContent: "Paste your portal address and a token from the portal's Settings page to start." }), el("div", { class: "actions", style: "margin-top:8px" }, connect)));
  } else if (ids.length === 0) {
    body.push(el("div", { class: "card muted", textContent: "Open one of your characters on D&D Beyond once. It shows up here and then keeps syncing, even with the tab closed." }));
  } else {
    body.push(el("ul", { class: "plain" }, ...ids.map((id) => card(id, state.characters[id], state, busy, redraw))));
  }

  const all = el("button", { class: "small", textContent: "Sync all now", disabled: !paired || ids.length === 0 });
  all.addEventListener("click", async () => {
    all.disabled = true;
    all.textContent = "Syncing...";
    await ask({ type: "syncNow" }).catch(() => undefined);
    redraw();
  });
  app.replaceChildren(header, ...body, el("footer", {}, all, settings));
}

void render();
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") void render();
});
