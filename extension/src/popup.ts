import { el } from "./ui";
import { ago, duration, normalize, type CharacterState, type SyncState } from "./state";

const KEY = "sync";
const app = document.getElementById("app") as HTMLElement;

const load = async (): Promise<SyncState> => normalize((await chrome.storage.local.get(KEY))[KEY] as never);
const ask = <T,>(message: object) => chrome.runtime.sendMessage(message) as Promise<T>;
const openSettings = () => void chrome.runtime.openOptionsPage();

async function shortcut(): Promise<string> {
  const commands = await chrome.commands.getAll().catch(() => []);
  return commands.find((c) => c.name === "toggle-live")?.shortcut ?? "";
}

/** Where the character's sheet is in the portal, or the portal's character list. */
const sheetUrl = (state: SyncState, entry: CharacterState): string => (entry.campaignId && entry.sheetId ? `${state.portalUrl}/play/c/${entry.campaignId}/sheets/${entry.sheetId}` : `${state.portalUrl}/play`);

function avatar(entry: CharacterState, id: string): HTMLElement {
  if (entry.avatarUrl) return el("img", { class: "avatar", src: entry.avatarUrl, alt: "", referrerPolicy: "no-referrer" });
  return el("div", { class: "avatar", textContent: (entry.name ?? id).slice(0, 1).toUpperCase(), ariaHidden: "true" });
}

function hpBar(entry: CharacterState): HTMLElement | null {
  if (entry.hp === null || entry.maxHp === null || entry.maxHp <= 0) return null;
  const share = Math.max(0, Math.min(1, entry.hp / entry.maxHp));
  const bar = el("div", { class: `hp ${share <= 0.25 ? "crit" : share <= 0.5 ? "low" : ""}`, role: "img", ariaLabel: `${entry.hp} of ${entry.maxHp} hit points` }, el("span", { style: `width:${Math.round(share * 100)}%` }));
  return el("div", { class: "row", style: "margin-top:6px" }, el("div", { class: "grow" }, bar), el("span", { class: "faint", style: "font-size:11px", textContent: `${entry.hp}/${entry.maxHp} HP` }));
}

function characterCard(id: string, entry: CharacterState, state: SyncState, busy: Set<string>, redraw: () => void): HTMLElement {
  const tone = !entry.enabled ? "faint" : entry.lastError ? (entry.needsCampaign ? "warn" : "bad") : entry.lastSyncAt ? "ok" : "faint";
  const status = !entry.enabled ? "Paused in Settings" : (entry.lastError ?? (entry.lastSyncAt ? `Synced ${ago(entry.lastSyncAt, Date.now())}` : "Not synced yet"));
  const sync = el("button", { class: "small", textContent: busy.has(id) ? "Syncing…" : "Sync now", disabled: busy.has(id) || !entry.enabled });
  sync.addEventListener("click", async () => {
    busy.add(id);
    redraw();
    await ask({ type: "syncNow", id }).catch(() => undefined);
    busy.delete(id);
    redraw();
  });
  const open = el("a", { class: "button small", href: sheetUrl(state, entry), target: "_blank", rel: "noreferrer", textContent: entry.sheetId ? "Open sheet" : "Open portal" });
  const head = el(
    "div",
    { class: "row" },
    avatar(entry, id),
    el("div", { class: "grow" }, el("div", { class: "truncate", style: "font-weight:650", textContent: entry.name ?? `Character ${id}` }), el("div", { class: "muted truncate", style: "font-size:12px", textContent: entry.summary || `D&D Beyond ${id}` })),
  );
  const parts: HTMLElement[] = [head];
  const hp = hpBar(entry);
  if (hp) parts.push(hp);
  parts.push(el("div", { class: tone, style: "font-size:12px;margin-top:6px", textContent: status }), el("div", { class: "char-actions" }, sync, open));
  return el("li", { class: "card" }, ...parts);
}

async function render(busy = new Set<string>()) {
  const state = await load();
  const redraw = () => void render(busy);
  const paired = Boolean(state.portalUrl && state.token);
  const live = paired && state.settings.live;
  const ids = Object.keys(state.characters);
  const problems = ids.filter((id) => state.characters[id].enabled && state.characters[id].lastError).length;

  const pill = !paired
    ? el("span", { class: "pill faint", textContent: "Not connected" })
    : live
      ? el("span", { class: "pill ok" }, el("span", { class: "dot pulse" }), "Live")
      : el("span", { class: "pill faint" }, el("span", { class: "dot" }), "Off");
  const subtitle = !paired ? "D&D Beyond to your party portal" : problems ? `${problems} character${problems > 1 ? "s need" : " needs"} attention` : new URL(state.portalUrl as string).host;
  const header = el(
    "header",
    { class: "row" },
    el("img", { src: "icons/icon-48.png", alt: "" }),
    el("div", { class: "grow" }, el("h1", { textContent: "Portal sync" }), el("div", { class: `${problems && paired ? "warn" : "muted"} truncate`, style: "font-size:12px", textContent: subtitle })),
    pill,
  );

  const body: HTMLElement[] = [];
  if (!paired) {
    const connect = el("button", { class: "primary", textContent: "Connect to your portal" });
    connect.addEventListener("click", openSettings);
    body.push(
      el(
        "div",
        { class: "card raised stack", style: "margin-top:12px" },
        el("h2", { textContent: "Connect once, then play" }),
        el("p", { class: "muted", textContent: "Open the portal's Settings, D&D Beyond sync, and press Connect this browser. Or paste a token on the extension's Settings page." }),
        el("div", {}, connect),
      ),
    );
  } else {
    const keys = await shortcut();
    const toggle = el("button", { class: "switch-lg", role: "switch", ariaChecked: String(live), ariaLabel: "Live sync" });
    toggle.addEventListener("click", async () => {
      toggle.disabled = true;
      await ask({ type: "setLive", live: !live }).catch(() => undefined);
      redraw();
    });
    const stats = live
      ? `Live for ${duration(state.session.startedAt, Date.now())} · ${state.session.syncs} update${state.session.syncs === 1 ? "" : "s"} · ${state.session.rolls} roll${state.session.rolls === 1 ? "" : "s"}`
      : "Nothing syncs on its own. Start it when you sit down to play, so the table sees you as live.";
    const hint = keys ? el("div", { class: "faint", style: "font-size:11px" }, "Shortcut ", el("kbd", { textContent: keys })) : null;
    body.push(
      el(
        "div",
        { class: `card raised live ${live ? "on" : ""}` },
        el("div", { class: "row" }, el("div", { class: "grow" }, el("h2", { textContent: live ? "Live sync is on" : "Live sync is off" }), el("div", { class: "muted", style: "font-size:12px", textContent: stats })), toggle),
        ...(hint ? [hint] : []),
      ),
    );

    body.push(el("div", { class: "eyebrow", textContent: "Characters" }));
    if (ids.length === 0) body.push(el("div", { class: "card muted", textContent: "Open one of your characters on D&D Beyond once. It shows up here, and syncs while live sync is on, even with the tab closed." }));
    else body.push(el("ul", { class: "plain" }, ...ids.map((id) => characterCard(id, state.characters[id], state, busy, redraw))));

    if (state.rolls.length > 0) {
      body.push(el("div", { class: "eyebrow", textContent: "Recent rolls" }));
      body.push(
        el(
          "div",
          { class: "card" },
          ...state.rolls.map((roll) => el("div", { class: "roll" }, el("span", { class: "truncate", textContent: roll.label }), el("span", { class: "row", style: "gap:8px" }, el("span", { class: "faint", style: "font-size:11px", textContent: ago(roll.at, Date.now()) }), el("span", { class: "total", textContent: String(roll.total) })))),
        ),
      );
    }
  }

  const all = el("button", { class: "ghost small", textContent: "Sync all once", disabled: !paired || ids.length === 0 });
  all.addEventListener("click", async () => {
    all.disabled = true;
    all.textContent = "Syncing…";
    await ask({ type: "syncNow" }).catch(() => undefined);
    redraw();
  });
  const settings = el("button", { class: "ghost small", textContent: "Settings" });
  settings.addEventListener("click", openSettings);
  app.replaceChildren(header, ...body, el("footer", {}, all, settings));
}

void render();
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") void render();
});
// The "live for" time moves on while the popup is open.
setInterval(() => void render(), 30_000);
