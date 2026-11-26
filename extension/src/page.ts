// Runs in the D&D Beyond page itself (world: MAIN), where the page's own calls can be seen.
// It never reads data: it only tells the content script that the character was written to,
// so the content script refreshes at once instead of waiting for its next poll.

import { rollFromFrame } from "./state";

const CHARACTER_WRITE =/character-service\.dndbeyond\.com\/character\/v5\//;

function tell(type: string) {
  window.postMessage({ source: "portal-ddb", type }, window.location.origin);
}

// Set only by the diagnostic build (DIAG=1 npm run build:extension): logs how D&D Beyond
// delivers roll messages. Names and shapes only, never character data or tokens.
declare const DIAG: boolean;
const diag = (...parts: unknown[]) => {
  if (DIAG) console.log("[portal-diag]", ...parts);
};
const shapeOf = (value: unknown): unknown => {
  const list = Array.isArray(value) ? value : ((value as { data?: unknown } | null)?.data ?? value);
  return Array.isArray(list) ? list.slice(-5).map((m) => (m as { eventType?: string })?.eventType ?? Object.keys(m ?? {}).slice(0, 6)) : Object.keys((list as object) ?? {}).slice(0, 8);
};

if (DIAG) {
  // Everything that could carry a roll besides fetch: XHR, beacons, workers, outgoing socket frames.
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    const path = String(url).split("?")[0];
    if (/game-log|dice|roll|message/i.test(path)) diag("xhr", method, path);
    return (open as (...a: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;
  const beacon = navigator.sendBeacon.bind(navigator);
  navigator.sendBeacon = (url, data) => {
    diag("beacon", String(url).split("?")[0]);
    return beacon(url, data);
  };
  for (const name of ["Worker", "SharedWorker"] as const) {
    const Native = window[name] as unknown as new (url: string | URL, options?: unknown) => unknown;
    if (!Native) continue;
    (window as unknown as Record<string, unknown>)[name] = new Proxy(Native, {
      construct(target, args: [string | URL, unknown?]) {
        diag(name, String(args[0]).slice(0, 120));
        return new target(...args) as object;
      },
    });
  }
  const send = WebSocket.prototype.send;
  WebSocket.prototype.send = function (this: WebSocket, data: Parameters<WebSocket["send"]>[0]) {
    let kind: unknown = typeof data;
    try {
      if (typeof data === "string") kind = (JSON.parse(data) as { eventType?: string }).eventType ?? Object.keys(JSON.parse(data) as object).slice(0, 6);
    } catch {
      kind = "not json";
    }
    diag("ws send", this.url.split("?")[0], kind);
    return send.call(this, data);
  };
}

const originalFetch = window.fetch;
window.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
  const result = originalFetch.call(this, input, init);
  try {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (DIAG && /game-log/.test(url)) {
      diag("fetch", method, url.split("?")[0]);
      void result.then((r) => r.clone().json()).then((body) => diag("fetch body", shapeOf(body)), () => undefined);
    }
    if (method !== "GET" && CHARACTER_WRITE.test(url)) void result.then(() => tell("changed"), () => undefined);
  } catch {
    // Watching must never break the page.
  }
  return result;
};

// Rolls made at a table (a campaign game) are broadcast through D&D Beyond's game log
// socket. Hand every finished roll message to the content script, which decides whether
// it is this character's. Rolls outside a campaign never reach the log.
// The page sends its own rolls out over the socket and never receives them back, so the
// outgoing frame is where a roll is seen.
// The page's game-log connection, and the portal rolls this script sent on it itself (they must not
// come back to the portal as new D&D Beyond rolls).
let gameLogSocket: WebSocket | null = null;
const ours = new Set<string>();

const nativeSend = WebSocket.prototype.send;
WebSocket.prototype.send = function (this: WebSocket, data: Parameters<WebSocket["send"]>[0]) {
  try {
    const message = rollFromFrame(this.url, data);
    if (message && !(message.id && ours.has(message.id))) window.postMessage({ source: "portal-ddb", type: "roll", message }, window.location.origin);
  } catch {
    // Watching must never break the page.
  }
  return nativeSend.call(this, data);
};

const NativeSocket = window.WebSocket;
window.WebSocket = new Proxy(NativeSocket, {
  construct(target, args: ConstructorParameters<typeof WebSocket>) {
    const socket = new target(...args);
    const url = String(args[0]).split("?")[0];
    diag("ws open", url);
    const gameLog = /game-log/.test(url);
    if (gameLog) gameLogSocket = socket;
    if (gameLog || DIAG) {
      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(String(event.data)) as { eventType?: string };
          diag("ws message", url, message.eventType ?? shapeOf(message));
          if (gameLog && message.eventType === "dice/roll/fulfilled") window.postMessage({ source: "portal-ddb", type: "roll", message }, window.location.origin);
        } catch {
          diag("ws message, not json", url, typeof event.data === "string" ? event.data.slice(0, 40) : typeof event.data);
        }
      });
    }
    return socket;
  },
});

// A portal roll for D&D Beyond's game log, from the extension's content script: sent on the page's own
// game-log connection, as if rolled here. The answer says whether it went out.
window.addEventListener("message", (event) => {
  const data = event.data as { source?: unknown; type?: unknown; frame?: { id?: unknown; eventType?: unknown; entityType?: unknown } } | null;
  if (event.source !== window || data?.source !== "portal-ext-roll" || data.type !== "send") return;
  const frame = data.frame;
  const id = typeof frame?.id === "string" ? frame.id : "";
  let ok = false;
  if (id && frame?.eventType === "dice/roll/fulfilled" && frame.entityType === "character" && gameLogSocket?.readyState === WebSocket.OPEN) {
    ours.add(id);
    if (ours.size > 100) ours.delete(ours.values().next().value as string);
    nativeSend.call(gameLogSocket, JSON.stringify(frame));
    ok = true;
  }
  window.postMessage({ source: "portal-ddb", type: "sent", id, ok }, window.location.origin);
});
