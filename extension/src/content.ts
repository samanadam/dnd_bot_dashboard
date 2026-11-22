import { characterIdFromPath, nextBackoff } from "./state";

// Runs on a D&D Beyond character page. Reads the character the way the page does
// (the page's own login gives a short-lived token, kept in memory only) and hands it
// to the background script. Nothing here talks to the portal.

const id = characterIdFromPath(location.pathname);
let token: { value: string; expires: number } | null = null;
let failures = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;

async function cobaltToken(): Promise<string> {
  if (token && token.expires > Date.now()) return token.value;
  const response = await fetch("https://auth-service.dndbeyond.com/v1/cobalt-token", { method: "POST", credentials: "include" });
  if (!response.ok) throw new Error(`token ${response.status}`);
  const body = (await response.json()) as { token?: string; ttl?: number };
  if (!body.token) throw new Error("no token");
  token = { value: body.token, expires: Date.now() + Math.max(30, (body.ttl ?? 300) - 30) * 1000 };
  return body.token;
}

async function capture(characterId: string): Promise<void> {
  const bearer = await cobaltToken();
  const response = await fetch(`https://character-service.dndbeyond.com/character/v5/character/${characterId}?includeCustomItems=true`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  if (response.status === 401 || response.status === 403) token = null;
  if (!response.ok) throw new Error(`character ${response.status}`);
  const character = (await response.json()) as { data?: { canEdit?: boolean } };
  const answer = (await chrome.runtime.sendMessage({
    type: "character",
    ddbCharacterId: characterId,
    capturedAt: new Date().toISOString(),
    readOnly: character.data?.canEdit !== true,
    character,
  })) as { ok: boolean } | undefined;
  if (!answer?.ok) throw new Error("portal refused");
}

async function tick(): Promise<void> {
  if (!id || running) return;
  running = true;
  try {
    await capture(id);
    failures = 0;
  } catch {
    failures += 1;
  } finally {
    running = false;
    schedule(nextBackoff(failures));
  }
}

function schedule(delay: number) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    // A hidden tab waits; it refreshes the moment it is shown again.
    if (document.visibilityState === "visible") void tick();
    else schedule(nextBackoff(0));
  }, delay);
}

if (id) {
  void tick();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void tick();
  });
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "portal-ddb") return;
    if (event.data.type === "changed") schedule(1500);
  });
}
