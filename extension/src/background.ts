import { BLANK_CHARACTER, needsCheck, normalize, shouldPush, signature, withLog, type CharacterState, type SyncState } from "./state";
import { clampInterval, syncAll, type PushMessage, type SyncDeps } from "./sync";

// The only script that talks to the portal and, on a timer, to D&D Beyond. It reads every
// character the player has opened (a tab does not have to be open or visible), pushes the
// ones that changed, keeps the pairing and the activity log, and shows trouble on the badge.

const KEY = "sync";
const ALARM = "portal-sync";

async function load(): Promise<SyncState> {
  return normalize((await chrome.storage.local.get(KEY))[KEY] as Partial<SyncState> | undefined);
}
const save = (state: SyncState) => chrome.storage.local.set({ [KEY]: state });

function badge(text: string) {
  if (text === "") return void showLive();
  void chrome.action.setBadgeText({ text });
  void chrome.action.setBadgeBackgroundColor({ color: "#b3261e" });
}

/** No trouble to show: a green LIVE while live sync is on, nothing otherwise. */
async function showLive() {
  const { settings } = await load();
  void chrome.action.setBadgeText({ text: settings.live ? "LIVE" : "" });
  void chrome.action.setBadgeBackgroundColor({ color: "#1d7a46" });
}

const entryOf = (state: SyncState, id: string): CharacterState => (state.characters[id] ??= { ...BLANK_CHARACTER });
const note = (state: SyncState, text: string, bad = false) => void (state.log = withLog(state.log, text, bad, new Date().toISOString()));

async function callPortal(state: SyncState, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${state.portalUrl}/api/ext/${path}`, {
    ...init,
    headers: { ...(init.body ? { "content-type": "application/json" } : {}), authorization: `Bearer ${state.token}` },
  });
}

// What the portal says when a push does not go through.
function explain(status: number, body: { error?: { code?: string; message?: string } } | null): string {
  if (status === 401) return "The token is no longer valid. Pair the extension again.";
  if (status === 409 && body?.error?.code === "needs_campaign") return "Choose this character's campaign in the portal (Settings, D&D Beyond sync).";
  if (status === 429) return "The portal asked the extension to slow down. It will try again.";
  return body?.error?.message ?? `The portal answered ${status}.`;
}

async function pushCharacter(message: PushMessage): Promise<{ ok: boolean }> {
  const state = await load();
  if (!state.portalUrl || !state.token) {
    badge("!");
    return { ok: false };
  }
  const id = message.ddbCharacterId;
  const entry = entryOf(state, id);
  const name = (message.character as { data?: { name?: unknown } } | null)?.data?.name;
  if (typeof name === "string" && name) entry.name = name.slice(0, 120);
  if (!entry.enabled) {
    await save(state);
    return { ok: true };
  }

  const sessionKey = `sig:${id}`;
  const previous = ((await chrome.storage.session.get(sessionKey))[sessionKey] as string | undefined) ?? null;
  const current = signature(JSON.stringify(message.character));
  if (!shouldPush(previous, current)) {
    const checked = ((await chrome.storage.session.get("checked")).checked as number | undefined) ?? null;
    if (needsCheck(checked, Date.now())) {
      const answer = await callPortal(state, "ping").catch(() => null);
      if (answer?.status === 401) {
        entry.lastError = explain(401, null);
        badge("AUTH");
        await save(state);
        return { ok: false };
      }
      if (answer?.ok) await chrome.storage.session.set({ checked: Date.now() });
    }
    entry.lastSyncAt = new Date().toISOString();
    await save(state);
    return { ok: true };
  }

  try {
    const response = await callPortal(state, "sheets/sync", {
      method: "POST",
      body: JSON.stringify({ ddbCharacterId: id, capturedAt: message.capturedAt, readOnly: message.readOnly, character: message.character }),
    });
    const body = (await response.json().catch(() => null)) as { sheetId?: string; created?: boolean; ignored?: boolean; error?: { code?: string; message?: string } } | null;
    if (response.ok) {
      await chrome.storage.session.set({ [sessionKey]: current });
      entry.lastSyncAt = new Date().toISOString();
      entry.lastError = null;
      entry.needsCampaign = false;
      if (body?.sheetId) entry.sheetId = body.sheetId;
      if (!body?.ignored) note(state, `${entry.name ?? `Character ${id}`}: ${body?.created ? "created in the portal" : "synced"}.`);
      badge("");
    } else {
      entry.lastError = explain(response.status, body);
      entry.needsCampaign = response.status === 409 && body?.error?.code === "needs_campaign";
      note(state, `${entry.name ?? `Character ${id}`}: ${entry.lastError}`, true);
      badge(response.status === 401 ? "AUTH" : entry.needsCampaign ? "?" : "!");
    }
    await save(state);
    return { ok: response.ok };
  } catch {
    entry.lastError = "Cannot reach the portal.";
    note(state, entry.lastError, true);
    badge("!");
    await save(state);
    return { ok: false };
  }
}

async function cobaltToken(): Promise<string> {
  const cached = (await chrome.storage.session.get("ddbToken")).ddbToken as { value: string; expires: number } | undefined;
  if (cached && cached.expires > Date.now()) return cached.value;
  const response = await fetch("https://auth-service.dndbeyond.com/v1/cobalt-token", { method: "POST", credentials: "include" });
  if (!response.ok) throw new Error(`token ${response.status}`);
  const body = (await response.json()) as { token?: string; ttl?: number };
  if (!body.token) throw new Error("no token");
  await chrome.storage.session.set({ ddbToken: { value: body.token, expires: Date.now() + Math.max(30, (body.ttl ?? 300) - 30) * 1000 } });
  return body.token;
}

const deps: SyncDeps = {
  getToken: cobaltToken,
  invalidateToken: () => void chrome.storage.session.remove("ddbToken"),
  fetchCharacter: async (id, token) => {
    const response = await fetch(`https://character-service.dndbeyond.com/character/v5/character/${id}?includeCustomItems=true`, { headers: { Authorization: `Bearer ${token}` }, credentials: "omit" });
    return { status: response.status, json: response.ok ? await response.json() : undefined };
  },
  push: pushCharacter,
  report: async (id, error) => {
    const state = await load();
    const entry = entryOf(state, id);
    entry.lastError = error;
    if (error) note(state, `${entry.name ?? `Character ${id}`}: ${error}`, true);
    await save(state);
    if (error) badge(/Sign in/.test(error) ? "IN" : "!");
  },
  now: () => Date.now(),
};

/** Tells the portal whether live sync is on, so it can show the player as live (or not) to the table. */
async function heartbeat(state: SyncState, live: boolean): Promise<void> {
  if (!state.portalUrl || !state.token) return;
  const answer = await callPortal(state, "live", { method: "PUT", body: JSON.stringify({ live }) }).catch(() => null);
  if (answer?.status === 401) badge("AUTH");
}

/** Syncs the given characters, or every enabled one the player has opened. Automatic rounds only run while live sync is on. */
async function round(only?: string, manual = false): Promise<Record<string, string>> {
  const state = await load();
  if (!state.portalUrl || !state.token) return {};
  if (!manual && !state.settings.live) return {};
  if (state.settings.live) await heartbeat(state, true);
  const ids = only ? [only] : Object.entries(state.characters).filter(([, entry]) => entry.enabled).map(([id]) => id);
  return syncAll(deps, ids);
}

async function schedule() {
  const { settings } = await load();
  await chrome.alarms.create(ALARM, { delayInMinutes: 0.1, periodInMinutes: clampInterval(settings.intervalSeconds) / 60 });
}

chrome.runtime.onInstalled.addListener(() => void schedule());
// Live sync starts off after every browser start: the player starts it when they sit down to play.
chrome.runtime.onStartup.addListener(() => {
  void schedule();
  void setLive(false);
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) void round();
});

async function setLive(live: boolean): Promise<{ ok: boolean }> {
  const state = await load();
  state.settings.live = live;
  note(state, live ? "Live sync started." : "Live sync stopped.");
  await save(state);
  await heartbeat(state, live);
  void showLive();
  if (live) await round(undefined, true);
  return { ok: true };
}
// A change of the interval on the options page moves the timer.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[KEY]) return;
  const before = clampInterval((changes[KEY].oldValue as Partial<SyncState> | undefined)?.settings?.intervalSeconds);
  const after = clampInterval((changes[KEY].newValue as Partial<SyncState> | undefined)?.settings?.intervalSeconds);
  if (before !== after) void schedule();
});

async function relayRoll(roll: { ddbCharacterId: string; label: string; expression: string; total: number; breakdown: string }): Promise<{ ok: boolean }> {
  const state = await load();
  if (!state.portalUrl || !state.token || !state.settings.replayRolls || state.characters[roll.ddbCharacterId]?.enabled === false) return { ok: false };
  const { ddbCharacterId, label, expression, total, breakdown } = roll;
  try {
    return { ok: (await callPortal(state, "rolls", { method: "POST", body: JSON.stringify({ ddbCharacterId, label, expression, total, breakdown }) })).ok };
  } catch {
    // The dice already showed on the page; a missed relay is not worth a warning.
    return { ok: false };
  }
}

async function ping(): Promise<{ ok: boolean; text: string; user?: string }> {
  const state = await load();
  if (!state.portalUrl || !state.token) return { ok: false, text: "Enter the portal address and a token first." };
  try {
    const response = await callPortal(state, "ping");
    if (response.status === 401) return { ok: false, text: "The portal does not accept this token." };
    if (!response.ok) return { ok: false, text: `The portal answered ${response.status}.` };
    const who = (await response.json()) as { user: string };
    return { ok: true, text: `Paired as ${who.user}.`, user: who.user };
  } catch {
    return { ok: false, text: "Cannot reach the portal." };
  }
}

chrome.runtime.onMessage.addListener((message: { type: string; id?: string }, _sender, respond) => {
  const work: Promise<unknown> =
    message.type === "roll"
      ? relayRoll((message as unknown as { roll: Parameters<typeof relayRoll>[0] }).roll)
      : message.type === "ping"
        ? ping()
        : message.type === "setLive"
          ? setLive((message as unknown as { live: boolean }).live === true)
          : message.type === "seen" || message.type === "refresh"
            ? message.id
              ? (async () => {
                  // A character page that was opened is remembered, so it syncs while live with the tab closed.
                  const state = await load();
                  if (!state.characters[message.id as string]) {
                    entryOf(state, message.id as string);
                    await save(state);
                  }
                  return round(message.id);
                })()
              : Promise.resolve({})
            : message.type === "syncNow"
              ? round(message.id, true)
              : Promise.resolve({ ok: false });
  void work.then(respond);
  return true;
});
