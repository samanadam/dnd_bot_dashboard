// The two web sources the bot can play, and how a saved item maps to a link.
//
// An item is stored as (source, ref): the 11-character video id for YouTube, the
// `artist/track` path for SoundCloud. The link sent to the bot is always rebuilt
// from the reference, never kept.

import { isSoundCloudRef, parseSoundCloudLink, soundcloudUrl, SOUNDCLOUD_LINK } from "@/lib/soundcloud";
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

/** Whether `ref` has the shape a stored reference of that source must have. */
export function isRef(source: WebSource, ref: string): boolean {
  return source === "youtube" ? VIDEO_ID.test(ref) : isSoundCloudRef(ref);
}

/** The link the bot accepts for a stored item. Throws on a malformed reference. */
export function trackUrl(source: WebSource, ref: string): string {
  return source === "youtube" ? watchUrl(ref) : soundcloudUrl(ref);
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

/** Which source a pasted link belongs to, and its reference; null if neither. */
export function detectLink(input: string): { source: WebSource; ref: string } | null {
  for (const source of WEB_SOURCES) {
    const ref = parseLink(source, input);
    if (ref) return { source, ref };
  }
  return null;
}

/** The reference for a track the bot returned: its link, or (YouTube search) a bare id. */
export function refFromTrack(source: WebSource, id: string): string | null {
  if (source === "youtube" && VIDEO_ID.test(id)) return id;
  return parseLink(source, id);
}
