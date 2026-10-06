// SoundCloud links, reduced to the one thing that is safe to keep: the
// `artist/track` path, lower case.
//
// Nothing else from a pasted link is stored or forwarded. A stored path that
// matches SC_REF cannot carry a host, a query string, a port or an option flag,
// and every link the portal sends to the bot is rebuilt from it. The bot applies
// the same rules again; neither side trusts the other to have done it.

const HOSTS = new Set(["soundcloud.com", "www.soundcloud.com", "m.soundcloud.com"]);
const SLUG = /^[A-Za-z0-9_-]{1,120}$/;
const MAX_INPUT = 500;

// Pages shaped like `<artist>/<track>` that are not a track (or not an artist).
// Kept in step with the bot's list; the bot also refuses anything the extractor
// does not call a single track.
const NOT_A_TRACK = new Set([
  "sets", "likes", "tracks", "albums", "reposts", "following", "followers", "comments",
  "popular-tracks", "spotlight", "playlists", "sounds", "people", "users", "groups",
  "recommended", "new", "you", "discover", "search", "stream", "upload", "charts",
  "stations", "feed", "settings", "notifications", "messages", "pages", "mobile", "pro",
  "go", "jobs",
]); // prettier-ignore

/** Exactly what a stored SoundCloud reference looks like: `artist/track`. */
export const SC_REF = /^[a-z0-9_-]{1,120}\/[a-z0-9_-]{1,120}$/;

/** The one link form the bot accepts for a SoundCloud sound. */
export const SOUNDCLOUD_LINK = /^https:\/\/soundcloud\.com\/[a-z0-9_-]{1,120}\/[a-z0-9_-]{1,120}$/;

function isTrackPath(artist: string, track: string): boolean {
  return !NOT_A_TRACK.has(artist) && !NOT_A_TRACK.has(track);
}

export function isSoundCloudRef(ref: string): boolean {
  if (!SC_REF.test(ref)) return false;
  const [artist, track] = ref.split("/");
  return isTrackPath(artist, track);
}

/** The one URL form sent to the bot. Throws on anything that is not a reference. */
export function soundcloudUrl(ref: string): string {
  if (!isSoundCloudRef(ref)) throw new Error("Not a SoundCloud track.");
  return `https://soundcloud.com/${ref}`;
}

/**
 * `artist/track` in a pasted SoundCloud link, or null. Sets, profiles, private
 * links (extra path parts), other hosts, credentials and odd ports all come back
 * null; a query string or fragment is ignored, not kept.
 */
export function parseSoundCloudLink(input: string): string | null {
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
  if (!HOSTS.has(url.hostname)) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2 || !segments.every((part) => SLUG.test(part))) return null;
  const ref = `${segments[0].toLowerCase()}/${segments[1].toLowerCase()}`;
  return isSoundCloudRef(ref) ? ref : null;
}

// Sets: SoundCloud albums and playlists share `artist/sets/name`. A set is only
// ever queued as music, through the bot's own set calls; every other call
// still refuses one. The name is capped at 115 so the whole reference fits the
// 241 characters the saved-links table allows.

/** Exactly what a stored SoundCloud set reference looks like: `artist/sets/name`. */
export const SC_SET_REF = /^[a-z0-9_-]{1,120}\/sets\/[a-z0-9_-]{1,115}$/;

/** The one link form the bot accepts for a SoundCloud set. */
export const SOUNDCLOUD_SET_LINK = /^https:\/\/soundcloud\.com\/[a-z0-9_-]{1,120}\/sets\/[a-z0-9_-]{1,115}$/;

export function isSoundCloudSetRef(ref: string): boolean {
  if (!SC_SET_REF.test(ref)) return false;
  return !NOT_A_TRACK.has(ref.split("/")[0]);
}

/** The one set URL sent to the bot. Throws on anything that is not a set reference. */
export function soundcloudSetUrl(ref: string): string {
  if (!isSoundCloudSetRef(ref)) throw new Error("Not a SoundCloud set.");
  return `https://soundcloud.com/${ref}`;
}

/** Whether `link` is exactly the set link form the bot accepts. */
export function isSoundCloudSetLink(link: string): boolean {
  return SOUNDCLOUD_SET_LINK.test(link) && isSoundCloudSetRef(link.slice("https://soundcloud.com/".length));
}

/**
 * `artist/sets/name` in a pasted public set link, or null. Private sets (a
 * fourth `s-<token>` part), other hosts, credentials and odd ports come back
 * null; a query string or fragment is ignored, not kept.
 */
export function parseSoundCloudSetLink(input: string): string | null {
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
  if (!HOSTS.has(url.hostname)) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 3 || segments[1].toLowerCase() !== "sets") return null;
  if (!SLUG.test(segments[0]) || !SLUG.test(segments[2])) return null;
  const ref = `${segments[0].toLowerCase()}/sets/${segments[2].toLowerCase()}`;
  return isSoundCloudSetRef(ref) ? ref : null;
}
