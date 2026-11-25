import { el } from "./ui";
import { ago, duration, normalize, portalOrigin, type SyncState } from "./state";
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
  [45, "every 45 seconds"],
  [60, "every minute"],
];

const SECTIONS: Array<[string, string]> = [
  ["connection", "Connection"],
  ["live", "Live sync"],
  ["characters", "Characters"],
  ["rolls", "Rolls and dice"],
  ["activity", "Activity"],
  ["about", "How it works"],
];

const section = (id: string, title: string, subtitle: string, ...children: Array<Node | string>) =>
  el("section", { class: "card", id }, el("h2", { textContent: title }), el("p", { class: "muted", style: "margin-top:2px", textContent: subtitle }), ...children);

function check(title: string, hint: string, checked: boolean, onChange: (value: boolean) => void): HTMLElement {
  const box = el("input", { type: "checkbox", checked });
  box.addEventListener("change", () => onChange(box.checked));
  return el("label", { class: "check" }, box, el("span", {}, el("strong", { textContent: title }), el("div", { class: "muted", textContent: hint })));
}

function connection(state: SyncState): HTMLElement {
  const url = el("input", { type: "text", placeholder: "https://portal.example.com", autocomplete: "off", value: state.portalUrl ?? "" });
  const token = el("input", { type: "password", placeholder: "ptx_…", autocomplete: "off", value: state.token ? "••••••••" : "" });
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
    if (!(await chrome.permissions.request({ origins: [`${origin}/*`] }).catch(() => false))) return say("The extension needs permission to reach the portal.", "bad");
    const typed = token.value.trim();
    await change((s) => {
      s.portalUrl = origin;
      if (typed && !typed.startsWith("•")) s.token = typed;
    });
    void chrome.action.setBadgeText({ text: "" });
    const answer = (await chrome.runtime.sendMessage({ type: "ping" })) as { ok: boolean; text: string };
    say(answer.text, answer.ok ? "ok" : "bad");
  });
  const test = el("button", { textContent: "Test" });
  test.addEventListener("click", async () => {
    const answer = (await chrome.runtime.sendMessage({ type: "ping" })) as { ok: boolean; text: string };
    say(answer.text, answer.ok ? "ok" : "bad");
  });
  const disconnect = el("button", { class: "ghost", textContent: "Disconnect" });
  disconnect.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "setLive", live: false }).catch(() => undefined);
    await change((s) => {
      s.token = null;
    });
    say("Disconnected. Revoke the token in the portal too if this browser is not yours.", "muted");
  });
  const quick = state.token
    ? el("p", { class: "ok", textContent: `Connected to ${state.portalUrl ? new URL(state.portalUrl).host : "the portal"}.` })
    : el("div", { class: "card", style: "margin-top:10px;background:var(--accent-soft);border-color:var(--accent)" }, el("strong", { textContent: "Fastest way: " }), "open the portal, go to Settings, D&D Beyond sync, and press Connect this browser. Nothing to copy.");
  return section(
    "connection",
    "Connection",
    "Which portal this browser sends your characters to.",
    quick,
    el("label", { class: "field", textContent: "Portal address" }, url),
    el("label", { class: "field", textContent: "Token" }, token),
    el("div", { class: "row", style: "margin-top:12px;flex-wrap:wrap" }, save, test, ...(state.token ? [disconnect] : []), status),
  );
}

function liveSection(state: SyncState, keys: string): HTMLElement {
  const interval = el("select", {}, ...INTERVALS.map(([value, label]) => el("option", { value: String(value), textContent: `Sync ${label}`, selected: value === clampInterval(state.settings.intervalSeconds) })));
  interval.addEventListener("change", () => void change((s) => void (s.settings.intervalSeconds = clampInterval(Number(interval.value)))));
  const toggle = el("button", { class: state.settings.live ? "" : "primary", textContent: state.settings.live ? "Stop live sync" : "Start live sync", disabled: !state.token });
  toggle.addEventListener("click", async () => {
    toggle.disabled = true;
    await chrome.runtime.sendMessage({ type: "setLive", live: !state.settings.live }).catch(() => undefined);
    void render();
  });
  const now = state.settings.live
    ? el("p", { class: "ok", textContent: `On for ${duration(state.session.startedAt, Date.now())}: ${state.session.syncs} update${state.session.syncs === 1 ? "" : "s"} and ${state.session.rolls} roll${state.session.rolls === 1 ? "" : "s"} so far.` })
    : el("p", { class: "muted", textContent: "Off. The portal shows you as offline." });
  return section(
    "live",
    "Live sync",
    "Your characters sync on their own only while this is on, and the table sees you as live. It turns itself off when the browser starts.",
    el("div", { class: "row", style: "margin-top:10px;flex-wrap:wrap" }, toggle, now),
    keys ? el("p", { class: "faint", style: "margin-top:8px" }, "Keyboard shortcut ", el("kbd", { textContent: keys }), ". Change it at chrome://extensions/shortcuts.") : el("p", { class: "faint", style: "margin-top:8px", textContent: "Set a keyboard shortcut at chrome://extensions/shortcuts." }),
    el("label", { class: "field", textContent: "While live" }, interval),
    check("Start live sync when I open a character", "Opening one of your characters on D&D Beyond turns live sync on, so you never forget.", state.settings.autoStart, (value) => void change((s) => void (s.settings.autoStart = value))),
  );
}

function characterRow(id: string, entry: SyncState["characters"][string]): HTMLElement {
  const others = entry.mine === false;
  const small = (title: string, checked: boolean, onChange: (value: boolean) => void) => {
    const box = el("input", { type: "checkbox", checked });
    box.addEventListener("change", () => onChange(box.checked));
    return el("label", { class: "row", style: "gap:6px;font-size:12px;cursor:pointer" }, box, title);
  };
  const toggles = el(
    "div",
    { style: "display:grid;gap:4px" },
    ...(others ? [] : [small("Sync", entry.enabled, (value) => void change((s) => void (s.characters[id] && (s.characters[id].enabled = value))))]),
    small("Show in popup", !entry.hidden, (value) => void change((s) => void (s.characters[id] && (s.characters[id].hidden = !value)))),
  );
  const remove = el("button", { class: "ghost small", textContent: "Forget" });
  remove.addEventListener("click", () => void change((s) => void delete s.characters[id]));
  const status = others ? "Another player's character. Never sent from this browser." : !entry.enabled ? "Not synced" : (entry.lastError ?? (entry.lastSyncAt ? `Synced ${ago(entry.lastSyncAt, Date.now())}` : "Not synced yet"));
  const tone = others || !entry.enabled ? "faint" : entry.lastError ? (entry.needsCampaign ? "warn" : "bad") : "ok";
  const picture = entry.avatarUrl ? el("img", { class: "avatar", src: entry.avatarUrl, alt: "", referrerPolicy: "no-referrer" }) : el("div", { class: "avatar", textContent: (entry.name ?? id).slice(0, 1).toUpperCase() });
  return el(
    "li",
    { class: "row", style: "padding:10px 0;border-top:1px solid var(--border)" },
    picture,
    el("div", { class: "grow" }, el("div", { style: "font-weight:650", textContent: entry.name ?? `Character ${id}` }), el("div", { class: "muted", style: "font-size:12px", textContent: entry.summary || `D&D Beyond ${id}` }), el("div", { class: tone, style: "font-size:12px", textContent: status })),
    toggles,
    remove,
  );
}

function characters(state: SyncState): HTMLElement {
  const entries = Object.entries(state.characters);
  if (entries.length === 0) return section("characters", "Characters", "None yet. Open one of your characters on D&D Beyond once and it appears here.");
  const mine = entries.filter(([, entry]) => entry.mine !== false);
  const others = entries.filter(([, entry]) => entry.mine === false);
  const list = (rows: typeof entries) => el("ul", { class: "plain", style: "gap:0;margin-top:6px" }, ...rows.map(([id, entry]) => characterRow(id, entry)));
  return section(
    "characters",
    "Characters",
    "Every character you have opened on D&D Beyond. Forget removes one until you open it again.",
    el("h3", { class: "eyebrow", textContent: `Your characters (${mine.length})` }),
    mine.length ? list(mine) : el("p", { class: "faint", textContent: "None yet." }),
    el("h3", { class: "eyebrow", textContent: `Other players' characters (${others.length})` }),
    others.length
      ? list(others)
      : el("p", { class: "faint", textContent: "None. A character you open but cannot edit (a friend's, through a shared campaign) lands here, hidden from the popup, and is never sent." }),
  );
}

function rolls(state: SyncState): HTMLElement {
  return section(
    "rolls",
    "Rolls and dice",
    "What happens when you roll on D&D Beyond (in a campaign game).",
    check("Send my rolls to the portal", "They appear in the portal's roll feed for the table.", state.settings.replayRolls, (value) => void change((s) => void (s.settings.replayRolls = value))),
    check("Show the 3D dice on D&D Beyond", "The portal's dice roll over the page when you roll.", state.settings.overlay, (value) => void change((s) => void (s.settings.overlay = value))),
  );
}

function activity(state: SyncState): HTMLElement {
  const clear = el("button", { class: "ghost small", textContent: "Clear" });
  clear.addEventListener("click", () => void change((s) => void (s.log = [])));
  const lines = [...state.log].reverse().map((line) => el("div", { class: line.bad ? "bad" : "" }, el("span", { class: "faint", textContent: `${new Date(line.at).toLocaleTimeString()}  ` }), line.text));
  return el(
    "section",
    { class: "card", id: "activity" },
    el("div", { class: "row" }, el("h2", { class: "grow", textContent: "Activity" }), clear),
    el("p", { class: "muted", style: "margin-top:2px", textContent: "The last 40 things the extension did. Nothing here leaves your browser." }),
    lines.length ? el("div", { class: "log" }, ...lines) : el("p", { class: "faint", style: "margin-top:8px", textContent: "Nothing yet." }),
  );
}

function about(): HTMLElement {
  const steps = [
    "Connect once: the portal's Settings, D&D Beyond sync, Connect this browser.",
    "Open each of your characters on D&D Beyond once, so the extension knows them.",
    "When you sit down to play, start live sync (popup, the shortcut, or automatically).",
    "The extension reads your characters with your own D&D Beyond sign-in and sends them to the portal. Your D&D Beyond login never leaves this browser.",
    "The table sees your sheet change as you play, and sees you as live. Stop when you are done, or just close the browser.",
  ];
  return section("about", "How it works", `Version ${chrome.runtime.getManifest().version}.`, el("ol", { style: "margin:8px 0 0;padding-left:18px;display:grid;gap:4px" }, ...steps.map((text) => el("li", { textContent: text }))));
}

async function render() {
  const state = await load();
  const keys = (await chrome.commands.getAll().catch(() => [])).find((c) => c.name === "toggle-live")?.shortcut ?? "";
  const nav = el("nav", { ariaLabel: "Settings sections" }, ...SECTIONS.map(([id, label]) => el("a", { href: `#${id}`, textContent: label })));
  const header = el(
    "header",
    { class: "row" },
    el("img", { src: "icons/icon-48.png", alt: "" }),
    el("div", { class: "grow" }, el("h1", { textContent: "Portal D&D Beyond Sync" }), el("div", { class: "muted", textContent: "Settings" })),
    el("span", { class: `pill ${state.token ? (state.settings.live ? "ok" : "faint") : "faint"}` }, el("span", { class: `dot ${state.settings.live ? "pulse" : ""}` }), state.token ? (state.settings.live ? "Live" : "Off") : "Not connected"),
  );
  app.replaceChildren(header, el("div", { class: "layout" }, nav, el("div", { class: "stack", style: "gap:14px" }, connection(state), liveSection(state, keys), characters(state), rolls(state), activity(state), about())));
}

void render();
// Keep the page current while it is open, but not while the player is typing in a field.
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local" && !(document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement)) void render();
});
