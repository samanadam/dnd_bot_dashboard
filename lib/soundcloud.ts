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
