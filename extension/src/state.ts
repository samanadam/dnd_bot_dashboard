// Small pure helpers shared by the extension scripts (and unit-tested in the portal's suite).

export type CharacterState = { lastSyncAt: string | null; lastError: string | null; enabled: boolean };
export type SyncState = { portalUrl: string | null; token: string | null; characters: Record<string, CharacterState> };

export const EMPTY_STATE: SyncState = { portalUrl: null, token: null, characters: {} };

/** Whether a character needs pushing: false when it is identical to the last one pushed. */
export const shouldPush = (previous: string | null, next: string): boolean => previous !== next;

/** Whether the pairing should be checked again: every 5 minutes, so a revoked token shows up even while the character does not change. */
export const needsCheck = (lastCheckedAt: number | null, now: number): boolean => lastCheckedAt === null || now - lastCheckedAt >= 300_000;

/** How long to wait before the next try after `failures` failed ones in a row: 15 s doubling, at most 5 min. */
export const nextBackoff = (failures: number): number => Math.min(300_000, 15_000 * 2 ** Math.max(0, failures));

/** A short fingerprint of serialized data (FNV-1a), so the extension keeps a hash, not the character. */
export function signature(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${text.length}:${hash.toString(16)}`;
}

/**
 * The finished-roll message in a frame the page sends to D&D Beyond's game log, or null.
 * The page sends its own rolls out and never gets them echoed back, so this is where they are seen.
 */
export function rollFromFrame(socketUrl: string, data: unknown): { id?: string; eventType: string } | null {
  if (!/game-log/.test(socketUrl) || typeof data !== "string") return null;
  try {
    const message = JSON.parse(data) as { eventType?: unknown } | null;
    return message && message.eventType === "dice/roll/fulfilled" ? (message as { id?: string; eventType: string }) : null;
  } catch {
    return null;
  }
}

/** The numeric character id in a D&D Beyond path such as /characters/150752285, or null. */
export function characterIdFromPath(pathname: string): string | null {
  return /^\/characters\/(\d{1,20})(?:\/|$)/.exec(pathname)?.[1] ?? null;
}

/** The portal's origin from what the player typed, or null when it is not an http(s) address. */
export function portalOrigin(input: string): string | null {
  try {
    const url = new URL(input.trim());
    return url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost") ? url.origin : null;
  } catch {
    return null;
  }
}
