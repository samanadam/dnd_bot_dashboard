// The messages the portal's own pages and the extension trade through window.postMessage, so a
// player can pair with one click instead of pasting a token. Shared by the extension (portal.ts)
// and the portal (lib/ext/bridge.ts). Everything coming in is checked; nothing extra is passed on.

export const PAGE_SOURCE = "portal-page";
export const EXT_SOURCE = "portal-ext";

export type PageMessage = { type: "hello" } | { type: "pair"; token: string };
export type ExtMessage = { type: "present"; version: string; paired: boolean; live: boolean } | { type: "paired"; ok: boolean; text: string };

const TOKEN = /^ptx_[A-Za-z0-9_-]{20,100}$/;
type Loose = Record<string, unknown>;
const loose = (data: unknown): Loose | null => (data && typeof data === "object" ? (data as Loose) : null);

export function parsePageMessage(data: unknown): PageMessage | null {
  const m = loose(data);
  if (!m || m.source !== PAGE_SOURCE) return null;
  if (m.type === "hello") return { type: "hello" };
  if (m.type === "pair" && typeof m.token === "string" && TOKEN.test(m.token)) return { type: "pair", token: m.token };
  return null;
}

export function parseExtMessage(data: unknown): ExtMessage | null {
  const m = loose(data);
  if (!m || m.source !== EXT_SOURCE) return null;
  if (m.type === "present" && typeof m.version === "string" && typeof m.paired === "boolean" && typeof m.live === "boolean") return { type: "present", version: m.version.slice(0, 20), paired: m.paired, live: m.live };
  if (m.type === "paired" && typeof m.ok === "boolean" && typeof m.text === "string") return { type: "paired", ok: m.ok, text: m.text.slice(0, 200) };
  return null;
}

/**
 * Whether a page origin is one of the portal sites the extension runs on, from the manifest's match
 * patterns ("https://portal.example/*"; a localhost pattern means any port). Only those may pair it.
 */
export function originAllowed(origin: string | undefined, patterns: string[]): boolean {
  if (!origin) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  return patterns.some((pattern) => {
    const match = /^(https?):\/\/([^/]+)\/\*$/.exec(pattern);
    if (!match || `${match[1]}:` !== url.protocol) return false;
    return match[2] === "localhost" ? url.hostname === "localhost" : url.host === match[2];
  });
}
