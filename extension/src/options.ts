import { el } from "./ui";
import { ago, normalize, portalOrigin, type SyncState } from "./state";
import { clampInterval } from "./sync";

const KEY = "sync";
const app = document.getElementById("app") as HTMLElement;

const load = async (): Promise<SyncState> => normalize((await chrome.storage.local.get(KEY))[KEY] as never);
// Changes are made on a fresh copy, so a sync that finished meanwhile is not overwritten.
async function change(edit: (state: SyncState) => void) {
  const state = await load();
  edit(state);
  await chrome.storage.local.set({ [KEY]: state });
}

const INTERVALS: Array<[number, string]> = [
  [30, "every 30 seconds"],
  [60, "every minute"],
];

function connection(state: SyncState): HTMLElement {
  const url = el("input", { type: "text", placeholder: "https://portal.example.com", autocomplete: "off", value: state.portalUrl ?? "" });
  const token = el("input", { type: "password", placeholder: "ptx_...", autocomplete: "off", value: state.token ? "••••••••" : "" });
  const status = el("p", { class: "muted", role: "status" });
  const say = (text: string, tone: "ok" | "bad" | "muted") => {
    status.textContent = text;
    status.className = tone;
  };
  const save = el("button", { class: "primary", textContent: "Save and test" });
  save.addEventListener("click", async () => {
    const origin = portalOrigin(url.value);
    if (!origin) return say("Enter the portal address, starting with https://", "bad");
    // The permission prompt needs this click, so it comes first.
    if (!(await chrome.permissions.request({ origins: [`${origin}/*`] }))) return say("The extension needs permission to reach the portal.", "bad");
    const typed = token.value.trim();
    await change((s) => {
      s.portalUrl = origin;
      if (typed && !typed.startsWith("•")) s.token = typed;
    });
    void chrome.action.setBadgeText({ text: "" });
    const answer = (await chrome.runtime.sendMessage({ type: "ping" })) as { ok: boolean; text: string };
    say(answer.text, answer.ok ? "ok" : "bad");
    if (answer.ok) void chrome.runtime.sendMessage({ type: "syncNow" });
  });
  return el(
    "section",
    { class: "card" },
    el("h2", { textContent: "Connection" }),
    el("p", { class: "muted", textContent: "Make a token in the portal under Settings, D&D Beyond sync. One token works for every campaign." }),
    el("label", { class: "field", textContent: "Portal address" }, url),
    el("label", { class: "field", textContent: "Token" }, token),
    el("div", { class: "row", style: "margin-top:10px" }, save, status),
  );
}

function behaviour(state: SyncState): HTMLElement {
  const interval = el("select", {}, ...INTERVALS.map(([value, label]) => el("option", { value: String(value), textContent: `Sync ${label}`, selected: value === clampInterval(state.settings.intervalSeconds) })));
  interval.addEventListener("change", () => void change((s) => void (s.settings.intervalSeconds = clampInterval(Number(interval.value)))));
  const toggle = (key: "replayRolls" | "overlay", title: string, hint: string) => {
    const box = el("input", { type: "checkbox", checked: state.settings[key] });
    box.addEventListener("change", () => void change((s) => void (s.settings[key] = box.checked)));
    return el("label", { class: "switch" }, box, el("span", {}, el("strong", { textContent: title }), el("div", { class: "muted", textContent: hint })));
  };
  return el(
    "section",
    { class: "card" },
    el("h2", { textContent: "Syncing" }),
    el("p", { class: "muted", textContent: "Characters sync only while live sync is on. Start it from the extension's popup when you sit down to play. It needs no D&D Beyond tab, only a D&D Beyond sign-in in this browser, and it turns itself off when the browser starts. While it is on the portal shows you as live." }),
    el("label", { class: "field", textContent: "While live, sync" }, interval),
    toggle("replayRolls", "Send my rolls to the portal", "Rolls you make on D&D Beyond appear in the portal's roll feed."),
    toggle("overlay", "Show the 3D dice on D&D Beyond", "The portal's dice roll over the page when you roll."),
  );
}

function characters(state: SyncState, redraw: () => void): HTMLElement {
  const entries = Object.entries(state.characters);
  if (entries.length === 0) return el("section", { class: "card" }, el("h2", { textContent: "Characters" }), el("p", { class: "muted", textContent: "None yet. Open a character on D&D Beyond once and it appears here." }));
  const rows = entries.map(([id, entry]) => {
    const on = el("input", { type: "checkbox", checked: entry.enabled, title: "Sync this character" });
    on.addEventListener("change", () => void change((s) => void (s.characters[id] && (s.characters[id].enabled = on.checked))));
    const remove = el("button", { class: "small", textContent: "Forget" });
    remove.addEventListener("click", async () => {
      await change((s) => void delete s.characters[id]);
      redraw();
    });
    const status = !entry.enabled ? "Paused" : (entry.lastError ?? (entry.lastSyncAt ? `Synced ${ago(entry.lastSyncAt, Date.now())}` : "Waiting"));
    return el(
      "tr",
      {},
      el("td", {}, on),
      el("td", {}, el("strong", { textContent: entry.name ?? `Character ${id}` }), el("div", { class: "muted", textContent: `D&D Beyond id ${id}` })),
      el("td", { class: entry.lastError ? (entry.needsCampaign ? "warn" : "bad") : "", textContent: status }),
      el("td", {}, remove),
    );
  });
  return el(
    "section",
    { class: "card" },
    el("h2", { textContent: "Characters" }),
    el("table", {}, el("thead", {}, el("tr", {}, el("th", { textContent: "On" }), el("th", { textContent: "Character" }), el("th", { textContent: "Status" }), el("th", {}))), el("tbody", {}, ...rows)),
  );
}

function activity(state: SyncState, redraw: () => void): HTMLElement {
  const clear = el("button", { class: "small", textContent: "Clear" });
  clear.addEventListener("click", async () => {
    await change((s) => void (s.log = []));
    redraw();
  });
  const lines = [...state.log].reverse().map((line) => el("div", { class: line.bad ? "bad" : "" }, el("span", { class: "muted", textContent: `${new Date(line.at).toLocaleTimeString()}  ` }), line.text));
  return el("section", { class: "card" }, el("div", { class: "row" }, el("h2", { class: "grow", textContent: "Recent activity" }), clear), lines.length ? el("div", { class: "log" }, ...lines) : el("p", { class: "muted", textContent: "Nothing yet." }));
}

async function render() {
  const state = await load();
  const header = el("header", { class: "row" }, el("img", { src: "icons/icon-48.png", alt: "" }), el("div", {}, el("h1", { textContent: "Portal D&D Beyond Sync" }), el("div", { class: "muted", textContent: `Version ${chrome.runtime.getManifest().version}` })));
  const syncAll = el("button", { textContent: "Sync all once" });
  syncAll.addEventListener("click", () => void chrome.runtime.sendMessage({ type: "syncNow" }));
  app.replaceChildren(header, connection(state), behaviour(state), characters(state, () => void render()), activity(state, () => void render()), el("div", {}, syncAll));
}

void render();
// Keep the lists current while this page is open, but not while the player is typing in a field.
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local" && !(document.activeElement instanceof HTMLInputElement)) void render();
});
