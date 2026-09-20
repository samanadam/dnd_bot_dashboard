// YouTube links, reduced to the one thing that is safe to keep: the video id.
//
// Nothing else from a pasted link is stored or forwarded. A stored id that
// matches VIDEO_ID cannot carry a host, a path, a query string or an option
// flag, and every link the portal sends to the bot is rebuilt from it.

/** Exactly what a YouTube video id looks like. */
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);
// Paths of the form /<prefix>/<id>.
const ID_PREFIXES = new Set(["shorts", "embed", "live", "v"]);

const MAX_INPUT = 500;

/** The one link form the bot accepts for ambience and effects. */
export const WATCH_LINK = /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/;

/** The one URL form the bot accepts for sounds. Throws on anything that is not an id. */
export function watchUrl(videoId: string): string {
  if (!VIDEO_ID.test(videoId)) throw new Error("Not a YouTube video id.");
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** The link the bot returned for a track: a watch link, or (for search results) a bare id. */
export function videoIdFromTrack(id: string): string | null {
  return VIDEO_ID.test(id) ? id : parseYouTubeLink(id);
}

/**
 * The video id in a pasted YouTube link, or null. Playlists, channels, other
 * hosts, credentials and odd ports all come back null; extra parameters
 * (`list`, `t`, tracking) are ignored, not kept.
 */
export function parseYouTubeLink(input: string): string | null {
  const text = input.trim();
  if (!text || text.length > MAX_INPUT) return null;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  let candidate: string | null | undefined;

  if (url.hostname === "youtu.be") {
    candidate = segments[0];
  } else if (HOSTS.has(url.hostname)) {
    if (segments[0] === "watch") candidate = url.searchParams.get("v");
    else if (segments.length >= 2 && ID_PREFIXES.has(segments[0])) candidate = segments[1];
  } else {
    return null;
  }

  return candidate && VIDEO_ID.test(candidate) ? candidate : null;
}

/** Characters that let a title lie about what it is: controls and bidi overrides. */
export const UNSAFE_TEXT = /[\p{Cc}\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/u;
