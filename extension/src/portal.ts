import { EXT_SOURCE, parsePageMessage, type ExtMessage } from "./bridge";

// Runs on the portal's own pages. It answers the portal's "is the extension here?" and takes a
// token the player asked the portal to hand over, so pairing is one click. The portal address is
// this page's own origin, never something a message says.

const reply = (message: ExtMessage) => window.postMessage({ source: EXT_SOURCE, ...message }, location.origin);

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const message = parsePageMessage(event.data);
  if (!message) return;
  if (message.type === "hello") {
    void chrome.runtime
      .sendMessage({ type: "status", origin: location.origin })
      .then((status: { paired: boolean; live: boolean }) => reply({ type: "present", version: chrome.runtime.getManifest().version, paired: status.paired, live: status.live }))
      .catch(() => undefined);
  }
  if (message.type === "pair") {
    void chrome.runtime
      .sendMessage({ type: "pair", token: message.token, origin: location.origin })
      .then((result: { ok: boolean; text: string }) => reply({ type: "paired", ok: result.ok, text: result.text }))
      .catch(() => reply({ type: "paired", ok: false, text: "The extension could not be reached. Reload the page and try again." }));
  }
});
