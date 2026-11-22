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
