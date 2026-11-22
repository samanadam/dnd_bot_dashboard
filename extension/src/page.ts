// Runs in the D&D Beyond page itself (world: MAIN), where the page's own calls can be seen.
// It never reads data: it only tells the content script that the character was written to,
// so the content script refreshes at once instead of waiting for its next poll.

const CHARACTER_WRITE = /character-service\.dndbeyond\.com\/character\/v5\//;

function tell(type: string) {
  window.postMessage({ source: "portal-ddb", type }, window.location.origin);
}

const originalFetch = window.fetch;
window.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
  const result = originalFetch.call(this, input, init);
  try {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== "GET" && CHARACTER_WRITE.test(url)) void result.then(() => tell("changed"), () => undefined);
  } catch {
    // Watching must never break the page.
  }
  return result;
};

// Rolls made at a table (a campaign game) are broadcast through D&D Beyond's game log
// socket. Hand every finished roll message to the content script, which decides whether
// it is this character's. Rolls outside a campaign never reach the log.
const NativeSocket = window.WebSocket;
window.WebSocket = new Proxy(NativeSocket, {
  construct(target, args: ConstructorParameters<typeof WebSocket>) {
    const socket = new target(...args);
    if (/game-log/.test(String(args[0]))) {
      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(String(event.data)) as { eventType?: string };
          if (message.eventType === "dice/roll/fulfilled") window.postMessage({ source: "portal-ddb", type: "roll", message }, window.location.origin);
        } catch {
          // Not a roll message.
        }
      });
    }
    return socket;
  },
});
