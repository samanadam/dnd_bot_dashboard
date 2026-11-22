import { EMPTY_STATE, shouldPush, signature, type SyncState } from "./state";

// The only script that talks to the portal. Content scripts send it what they read
// from D&D Beyond; it keeps the pairing, remembers how each character is doing, and
// shows trouble on the toolbar badge.

const KEY = "sync";

async function load(): Promise<SyncState> {
  const stored = (await chrome.storage.local.get(KEY))[KEY] as Partial<SyncState> | undefined;
  return { ...EMPTY_STATE, ...stored, characters: { ...(stored?.characters ?? {}) } };
}

const save = (state: SyncState) => chrome.storage.local.set({ [KEY]: state });

function badge(text: string) {
  void chrome.action.setBadgeText({ text });
  void chrome.action.setBadgeBackgroundColor({ color: "#b3261e" });
}

type Character = { lastSyncAt: string | null; lastError: string | null; enabled: boolean };
const blank = (): Character => ({ lastSyncAt: null, lastError: null, enabled: true });

async function callPortal(state: SyncState, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${state.portalUrl}/api/ext/${path}`, {
    ...init,
    headers: { ...(init.body ? { "content-type": "application/json" } : {}), authorization: `Bearer ${state.token}` },
  });
}

async function pushCharacter(message: { ddbCharacterId: string; capturedAt: string; readOnly: boolean; character: unknown }): Promise<{ ok: boolean }> {
  const state = await load();
  if (!state.portalUrl || !state.token) {
    badge("!");
    return { ok: false };
  }
  const id = message.ddbCharacterId;
  const entry = state.characters[id] ?? blank();
  state.characters[id] = entry;
  if (!entry.enabled) return { ok: true };

  const sessionKey = `sig:${id}`;
  const previous = ((await chrome.storage.session.get(sessionKey))[sessionKey] as string | undefined) ?? null;
  const current = signature(JSON.stringify(message.character));
  if (!shouldPush(previous, current)) {
    entry.lastSyncAt = new Date().toISOString();
    await save(state);
    return { ok: true };
  }

  try {
    const response = await callPortal(state, "sheets/sync", {
      method: "POST",
      body: JSON.stringify({ ddbCharacterId: id, capturedAt: message.capturedAt, readOnly: message.readOnly, character: message.character }),
    });
    if (response.ok) {
      await chrome.storage.session.set({ [sessionKey]: current });
      entry.lastSyncAt = new Date().toISOString();
      entry.lastError = null;
      badge("");
    } else {
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      entry.lastError = response.status === 401 ? "The token is no longer valid. Pair the extension again." : (body?.error?.message ?? `The portal answered ${response.status}.`);
      badge(response.status === 401 ? "AUTH" : "!");
    }
    await save(state);
    return { ok: response.ok };
  } catch {
    entry.lastError = "Cannot reach the portal.";
    badge("!");
    await save(state);
    return { ok: false };
  }
}

async function ping(): Promise<{ ok: boolean; text: string }> {
  const state = await load();
  if (!state.portalUrl || !state.token) return { ok: false, text: "Enter the portal address and a token first." };
  try {
    const response = await callPortal(state, "ping");
    if (response.status === 401) return { ok: false, text: "The portal does not accept this token." };
    if (!response.ok) return { ok: false, text: `The portal answered ${response.status}.` };
    const who = (await response.json()) as { user: string };
    return { ok: true, text: `Paired as ${who.user}.` };
  } catch {
    return { ok: false, text: "Cannot reach the portal." };
  }
}

chrome.runtime.onMessage.addListener((message: { type: string }, _sender, respond) => {
  const work =
    message.type === "character"
      ? pushCharacter(message as never)
      : message.type === "ping"
        ? ping()
        : Promise.resolve({ ok: false });
  void work.then(respond);
  return true;
});
