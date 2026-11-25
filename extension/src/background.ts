import { originAllowed } from "./bridge";
import { asOthers, badgeFor, BLANK_CHARACTER, characterSummary, EMPTY_SESSION, needsCheck, normalize, shouldPush, signature, withLog, withRoll, type CharacterState, type SyncState } from "./state";
import { applyWrite, clampInterval, syncAll, type HpWrite, type PushMessage, type SyncDeps } from "./sync";

// The only script that talks to the portal and, on a timer, to D&D Beyond. It reads every
// character the player has opened (a tab does not have to be open or visible), pushes the
// ones that changed, keeps the pairing and the activity log, and shows trouble on the badge.

const KEY = "sync";
const ALARM = "portal-sync";

async function load(): Promise<SyncState> {
  return normalize((await chrome.storage.local.get(KEY))[KEY] as Partial<SyncState> | undefined);
}
const save = (state: SyncState) => chrome.storage.local.set({ [KEY]: state });

/** The toolbar badge, from the state as it is now (see badgeFor). Run after every change of the state. */
async function updateBadge() {
  const { text, color } = badgeFor(await load());
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
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
    return { ok: false };
  }
  const id = message.ddbCharacterId;
  const entry = entryOf(state, id);
  const about = characterSummary(message.character);
  entry.mine = true;
  if (about.name) entry.name = about.name;
  entry.summary = about.summary;
  entry.avatarUrl = about.avatarUrl;
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
    const body = (await response.json().catch(() => null)) as { sheetId?: string; campaignId?: string; created?: boolean; ignored?: boolean; hp?: number; maxHp?: number; error?: { code?: string; message?: string } } | null;
    if (response.ok) {
      await chrome.storage.session.set({ [sessionKey]: current });
      entry.lastSyncAt = new Date().toISOString();
      entry.lastError = null;
      entry.needsCampaign = false;
      if (body?.sheetId) entry.sheetId = body.sheetId;
      if (typeof body?.campaignId === "string") entry.campaignId = body.campaignId;
      if (typeof body?.hp === "number" && typeof body?.maxHp === "number") {
        entry.hp = body.hp;
        entry.maxHp = body.maxHp;
      }
      if (!body?.ignored && state.settings.live) state.session.syncs += 1;
      if (!body?.ignored) note(state, `${entry.name ?? `Character ${id}`}: ${body?.created ? "created in the portal" : "synced"}.`);
    } else {
      entry.lastError = explain(response.status, body);
      entry.needsCampaign = response.status === 409 && body?.error?.code === "needs_campaign";
      note(state, `${entry.name ?? `Character ${id}`}: ${entry.lastError}`, true);
    }
    await save(state);
    return { ok: response.ok };
  } catch {
    entry.lastError = "Cannot reach the portal.";
    note(state, entry.lastError, true);
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
  },
  notMine: async (id, character) => {
    const state = await load();
    const before = entryOf(state, id);
    const about = characterSummary(character);
    const after = asOthers({ ...before, name: about.name ?? before.name, summary: about.summary, avatarUrl: about.avatarUrl });
    state.characters[id] = after;
    if (before.mine !== false) note(state, `${after.name ?? `Character ${id}`} belongs to another player: kept under Other players and never sent.`);
    await save(state);
  },
  now: () => Date.now(),
};

/** Tells the portal whether live sync is on, so it can show the player as live (or not) to the table. */
async function heartbeat(state: SyncState, live: boolean): Promise<void> {
  if (!state.portalUrl || !state.token) return;
  const answer = await callPortal(state, "live", { method: "PUT", body: JSON.stringify({ live }) }).catch(() => null);
  if (answer?.status === 401) {
    // Shown on the player's own characters, where the popup and the badge pick it up.
    const fresh = await load();
    for (const entry of Object.values(fresh.characters)) if (entry.mine !== false && entry.enabled) entry.lastError = explain(401, null);
    await save(fresh);
  }
}

const putCharacter = async (path: string, body: unknown, token: string) =>
  fetch(`https://character-service.dndbeyond.com/character/v5/${path}`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body), credentials: "omit" });

/** An open D&D Beyond page of the character does not see a change made elsewhere until it reloads: tell it. */
async function tellOpenPages(write: HpWrite): Promise<void> {
  const tabs = await chrome.tabs.query({ url: `https://www.dndbeyond.com/characters/${write.ddbCharacterId}*` }).catch(() => []);
  for (const tab of tabs) if (tab.id !== undefined) void chrome.tabs.sendMessage(tab.id, { type: "hpSaved", write }).catch(() => undefined);
}

/** Two-way HP: saves on D&D Beyond the HP changes made in the portal for the player's own characters. */
async function applyPortalWrites(state: SyncState): Promise<void> {
  if (!state.settings.writeBack) return;
  const answer = await callPortal(state, "writes").catch(() => null);
  if (!answer?.ok) return;
  const writes = ((await answer.json().catch(() => null)) as { writes?: HpWrite[] } | null)?.writes ?? [];
  for (const write of writes) {
    const entry = state.characters[write.ddbCharacterId];
    if (!entry || entry.mine === false || !entry.enabled) continue;
    const result = await applyWrite({ ...deps, putCharacter }, write);
    if (result !== "ok") continue;
    await tellOpenPages(write);
    const fresh = await load();
    note(fresh, `${entry.name ?? `Character ${write.ddbCharacterId}`}: HP ${write.hp}${write.tempHp ? ` (+${write.tempHp} temp)` : ""} saved to D&D Beyond from the portal.`);
    await save(fresh);
  }
}

/** Syncs the given characters, or every enabled one the player has opened. Automatic rounds only run while live sync is on. */
async function round(only?: string, manual = false): Promise<Record<string, string>> {
  const state = await load();
  if (!state.portalUrl || !state.token) return {};
  if (!manual && !state.settings.live) return {};
  if (state.settings.live) await heartbeat(state, true);
  await applyPortalWrites(state);
  // Another player's character is never synced; one not read yet is, once, to find out whose it is.
  const ids = only ? [only] : Object.entries(state.characters).filter(([, entry]) => entry.enabled && entry.mine !== false).map(([id]) => id);
  return syncAll(deps, ids);
}

async function schedule() {
  const { settings } = await load();
  await chrome.alarms.create(ALARM, { delayInMinutes: 0.1, periodInMinutes: clampInterval(settings.intervalSeconds) / 60 });
}

chrome.runtime.onInstalled.addListener(async () => {
  void schedule();
  void updateBadge();
  // Characters older versions tried to sync and the portal refused as read-only are other players'.
  const state = await load();
  let moved = false;
  for (const [id, entry] of Object.entries(state.characters)) {
    if (entry.mine === null && entry.lastError && /read-only/i.test(entry.lastError)) {
      state.characters[id] = asOthers(entry);
      moved = true;
    }
  }
  if (moved) {
    note(state, "Moved characters that belong to other players under Other players.");
    await save(state);
  }
});
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
  state.session = live ? { startedAt: new Date().toISOString(), syncs: 0, rolls: 0 } : { ...EMPTY_SESSION };
  note(state, live ? "Live sync started." : "Live sync stopped.");
  await save(state);
  await heartbeat(state, live);
    if (live) await round(undefined, true);
  return { ok: true };
}
// A change of the interval on the options page moves the timer; any change can change the badge.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[KEY]) return;
  void updateBadge();
  const before = clampInterval((changes[KEY].oldValue as Partial<SyncState> | undefined)?.settings?.intervalSeconds);
  const after = clampInterval((changes[KEY].newValue as Partial<SyncState> | undefined)?.settings?.intervalSeconds);
  if (before !== after) void schedule();
});

async function relayRoll(roll: { ddbCharacterId: string; label: string; expression: string; total: number; breakdown: string; visibility?: "everyone" | "dm" | "self" }): Promise<{ ok: boolean }> {
  const state = await load();
  if (!state.portalUrl || !state.token || !state.settings.replayRolls || state.characters[roll.ddbCharacterId]?.enabled === false) return { ok: false };
  const { ddbCharacterId, label, expression, total, breakdown } = roll;
  const visibility = roll.visibility ?? "everyone";
  // A roll kept to oneself on D&D Beyond is not sent anywhere.
  if (visibility === "self") return { ok: true };
  try {
    const ok = (await callPortal(state, "rolls", { method: "POST", body: JSON.stringify({ ddbCharacterId, label, expression, total, breakdown, visibility }) })).ok;
    if (ok) {
      const fresh = await load();
      fresh.rolls = withRoll(fresh.rolls, { at: new Date().toISOString(), label: label.slice(0, 80), total });
      if (fresh.settings.live) fresh.session.rolls += 1;
      await save(fresh);
    }
    return { ok };
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

// The portal sites whose pages may pair the extension: the ones its portal script runs on.
const portalPatterns = (): string[] => (chrome.runtime.getManifest().content_scripts ?? []).filter((c) => c.js?.includes("portal.js")).flatMap((c) => c.matches ?? []);
const senderOrigin = (sender: chrome.runtime.MessageSender): string | undefined => {
  if (sender.origin) return sender.origin;
  try {
    return sender.url ? new URL(sender.url).origin : undefined;
  } catch {
    return undefined;
  }
};

/** A token handed over by the portal page itself. The address is that page's origin, checked against the manifest. */
async function pairFromPortal(token: unknown, sender: chrome.runtime.MessageSender): Promise<{ ok: boolean; text: string }> {
  const origin = senderOrigin(sender);
  if (sender.id !== chrome.runtime.id || !originAllowed(origin, portalPatterns()) || typeof token !== "string" || !/^ptx_[A-Za-z0-9_-]{20,100}$/.test(token)) return { ok: false, text: "This page may not pair the extension." };
  const state = await load();
  state.portalUrl = origin as string;
  state.token = token;
  note(state, `Connected to ${new URL(origin as string).host} from the portal.`);
  await save(state);
  await chrome.storage.session.remove("checked");
  const answer = await ping();
  if (answer.ok) void round(undefined, true);
    return answer;
}

/** Whether this browser is paired with the asking portal page, and live. */
async function statusFor(sender: chrome.runtime.MessageSender): Promise<{ paired: boolean; live: boolean }> {
  const state = await load();
  const origin = senderOrigin(sender);
  return { paired: Boolean(state.token && state.portalUrl && state.portalUrl === origin), live: state.settings.live };
}

chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== "toggle-live") return;
  const state = await load();
  if (state.portalUrl && state.token) await setLive(!state.settings.live);
});

type Message = { type: string; id?: string; token?: unknown; live?: unknown; roll?: Parameters<typeof relayRoll>[0] };

/** A character page was opened (or asks for a refresh): remember it, so it syncs while live with the tab closed. */
async function opened(message: Message): Promise<unknown> {
  if (!message.id) return {};
  const state = await load();
  if (!state.characters[message.id]) {
    entryOf(state, message.id);
    await save(state);
  }
  if (state.characters[message.id].mine === false) return {};
  // "Start live sync when I open a character": opening one of theirs starts it.
  if (message.type === "seen" && state.settings.autoStart && !state.settings.live && state.portalUrl && state.token) return setLive(true);
  return round(message.id);
}

/** Opens a character's sheet in the portal: straight away when the sync said where it is, else the portal is asked. */
async function openSheet(id: string | undefined): Promise<{ ok: boolean }> {
  const state = await load();
  if (!state.portalUrl) return { ok: false };
  const entry = id ? state.characters[id] : undefined;
  let place = entry?.campaignId && entry.sheetId ? { campaignId: entry.campaignId, sheetId: entry.sheetId } : null;
  if (!place && id && state.token) {
    const answer = await callPortal(state, `sheet?ddbCharacterId=${encodeURIComponent(id)}`).catch(() => null);
    const body = answer?.ok ? ((await answer.json().catch(() => null)) as { campaignId?: unknown; sheetId?: unknown } | null) : null;
    if (typeof body?.campaignId === "string" && typeof body?.sheetId === "string" && /^[A-Za-z0-9-]{1,64}$/.test(body.campaignId) && /^[A-Za-z0-9-]{1,64}$/.test(body.sheetId)) {
      place = { campaignId: body.campaignId, sheetId: body.sheetId };
      const fresh = await load();
      if (fresh.characters[id as string]) Object.assign(fresh.characters[id as string], place);
      await save(fresh);
    }
  }
  await chrome.tabs.create({ url: place ? `${state.portalUrl}/play/c/${place.campaignId}/sheets/${place.sheetId}` : `${state.portalUrl}/play` });
  return { ok: Boolean(place) };
}

const handlers: Record<string, (message: Message, sender: chrome.runtime.MessageSender) => Promise<unknown>> = {
  pair: (message, sender) => pairFromPortal(message.token, sender),
  status: (_message, sender) => statusFor(sender),
  roll: (message) => (message.roll ? relayRoll(message.roll) : Promise.resolve({ ok: false })),
  ping: () => ping(),
  setLive: (message) => setLive(message.live === true),
  seen: opened,
  refresh: opened,
  syncNow: (message) => round(message.id, true),
  open: (message) => openSheet(message.id),
};

chrome.runtime.onMessage.addListener((message: Message, sender, respond) => {
  const handler = handlers[message?.type];
  void (handler ? handler(message, sender) : Promise.resolve({ ok: false })).then(respond);
  return true;
});
