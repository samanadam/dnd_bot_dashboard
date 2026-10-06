// The two web sources the bot can play, and how a saved item maps to a link.
//
// An item is stored as (source, ref): the 11-character video id for YouTube, the
// `artist/track` path for SoundCloud. The link sent to the bot is always rebuilt
// from the reference, never kept. A SoundCloud set (album or playlist) is
// `artist/sets/name`, and only ever music.

import {
  isSoundCloudRef,
  isSoundCloudSetLink,
  isSoundCloudSetRef,
  parseSoundCloudLink,
  parseSoundCloudSetLink,
  soundcloudSetUrl,
  soundcloudUrl,
  SOUNDCLOUD_LINK,
} from "@/lib/soundcloud";
import { parseYouTubeLink, VIDEO_ID, watchUrl, WATCH_LINK } from "@/lib/youtube";

export const WEB_SOURCES = ["youtube", "soundcloud"] as const;
export type WebSource = (typeof WEB_SOURCES)[number];

export const WEB_SOURCE_LABEL: Record<WebSource, string> = { youtube: "YouTube", soundcloud: "SoundCloud" };

/** A label for any source the bot reports, the bucket included. */
export function sourceLabel(source: string): string {
  return source === "r2" ? "Library" : (WEB_SOURCE_LABEL[source as WebSource] ?? source);
}

export function isWebSource(value: unknown): value is WebSource {
  return typeof value === "string" && (WEB_SOURCES as readonly string[]).includes(value);
}

/** Whether `ref` is a set (album or playlist) reference. Only SoundCloud has sets. */
export function isSetRef(source: WebSource, ref: string): boolean {
  return source === "soundcloud" && isSoundCloudSetRef(ref);
}

/** Whether `link` is exactly the set link form the bot accepts. */
export function isSetLink(link: string): boolean {
  return isSoundCloudSetLink(link);
}

/**
 * Whether `ref` has the shape a stored reference of that source must have. A
 * set is accepted only as music: ambience and effects are single tracks.
 */
export function isRef(source: WebSource, ref: string, kind?: string): boolean {
  if (source === "youtube") return VIDEO_ID.test(ref);
  return isSoundCloudRef(ref) || (kind === "music" && isSoundCloudSetRef(ref));
}

/** The link the bot accepts for a stored item, set or track. Throws on a malformed reference. */
export function trackUrl(source: WebSource, ref: string): string {
  if (source === "youtube") return watchUrl(ref);
  return isSoundCloudSetRef(ref) ? soundcloudSetUrl(ref) : soundcloudUrl(ref);
}

/** Whether `link` is exactly the form the bot accepts for that source. */
export function isTrackLink(source: WebSource, link: string): boolean {
  if (source === "youtube") return WATCH_LINK.test(link);
  return SOUNDCLOUD_LINK.test(link) && isSoundCloudRef(link.slice("https://soundcloud.com/".length));
}

/** The reference in a pasted link of one source, or null. */
export function parseLink(source: WebSource, input: string): string | null {
  return source === "youtube" ? parseYouTubeLink(input) : parseSoundCloudLink(input);
}

/** Which source a pasted link belongs to, its reference, and whether it is a set; null if none. */
export function detectLink(input: string): { source: WebSource; ref: string; set: boolean } | null {
  for (const source of WEB_SOURCES) {
    const ref = parseLink(source, input);
    if (ref) return { source, ref, set: false };
  }
  const set = parseSoundCloudSetLink(input);
  return set ? { source: "soundcloud", ref: set, set: true } : null;
}

/** The reference for a track the bot returned: its link, or (YouTube search) a bare id. */
export function refFromTrack(source: WebSource, id: string): string | null {
  if (source === "youtube" && VIDEO_ID.test(id)) return id;
  return parseLink(source, id);
}
