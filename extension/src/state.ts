// Small pure helpers shared by the extension scripts (and unit-tested in the portal's suite).

import { DEFAULT_SETTINGS, type Settings } from "./sync";

export type CharacterState = {
  lastSyncAt: string | null;
  lastError: string | null;
  enabled: boolean;
  name: string | null;
  sheetId: string | null;
  // The portal could not tell which campaign this character belongs to and waits for a choice.
  needsCampaign: boolean;
  // Where the sheet lives in the portal, and what the popup shows about the character.
  campaignId: string | null;
  summary: string;
  avatarUrl: string | null;
  hp: number | null;
  maxHp: number | null;
  // Whether the player can edit it on D&D Beyond (their own), null until it was read once.
  mine: boolean | null;
  // Left out of the popup (it still shows in Settings).
  hidden: boolean;
  // D&D Beyond ids a portal roll in its game log is addressed with: the player, the campaign, its DM.
  ddbUserId: string | null;
  gameId: string | null;
  dmUserId: string | null;
};
export type Session = { startedAt: string | null; syncs: number; rolls: number };
export type RecentRoll = { at: string; label: string; total: number };
export type LogEntry = { at: string; text: string; bad: boolean };
export type SyncState = {
  portalUrl: string | null;
  token: string | null;
  characters: Record<string, CharacterState>;
  settings: Settings;
  log: LogEntry[];
  session: Session;
  rolls: RecentRoll[];
};

export const EMPTY_SESSION: Session = { startedAt: null, syncs: 0, rolls: 0 };
export const EMPTY_STATE: SyncState = { portalUrl: null, token: null, characters: {}, settings: DEFAULT_SETTINGS, log: [], session: EMPTY_SESSION, rolls: [] };
export const BLANK_CHARACTER: CharacterState = { lastSyncAt: null, lastError: null, enabled: true, name: null, sheetId: null, needsCampaign: false, campaignId: null, summary: "", avatarUrl: null, hp: null, maxHp: null, mine: null, hidden: false, ddbUserId: null, gameId: null, dmUserId: null };
export const MAX_LOG = 40;
export const MAX_ROLLS = 5;

/** The stored state with every field present, whatever an older version saved. */
export function normalize(stored: Partial<SyncState> | undefined): SyncState {
  const characters: Record<string, CharacterState> = {};
  for (const [id, entry] of Object.entries(stored?.characters ?? {})) characters[id] = { ...BLANK_CHARACTER, ...entry };
  return {
    portalUrl: stored?.portalUrl ?? null,
    token: stored?.token ?? null,
    characters,
    settings: { ...DEFAULT_SETTINGS, ...stored?.settings },
    log: Array.isArray(stored?.log) ? stored.log.slice(-MAX_LOG) : [],
    session: { ...EMPTY_SESSION, ...stored?.session },
    rolls: Array.isArray(stored?.rolls) ? stored.rolls.slice(0, MAX_ROLLS) : [],
  };
}

/**
 * A character the player cannot edit: another player's, opened through a shared campaign. It is kept, so
 * it does not come back as new, but never synced; the first time it is also hidden from the popup.
 */
export function asOthers(entry: CharacterState): CharacterState {
  return { ...entry, mine: false, enabled: false, lastError: null, needsCampaign: false, hidden: entry.mine === false ? entry.hidden : true };
}

/** The ids the popup shows, the player's own first and other players' apart, and how many are hidden. */
export function groups(characters: Record<string, CharacterState>): { mine: string[]; others: string[]; hidden: number } {
  const ids = Object.keys(characters);
  return {
    mine: ids.filter((id) => characters[id].mine !== false && !characters[id].hidden),
    others: ids.filter((id) => characters[id].mine === false && !characters[id].hidden),
    hidden: ids.filter((id) => characters[id].hidden).length,
  };
}

/** The recent rolls with one more, newest first. */
export const withRoll = (rolls: RecentRoll[], roll: RecentRoll): RecentRoll[] => [roll, ...rolls].slice(0, MAX_ROLLS);

/** How long live sync has been on: "under a minute", "12 min", "1 h 12 min"; "" when it is off. */
export function duration(startedAt: string | null, now: number): string {
  if (!startedAt) return "";
  const minutes = Math.floor(Math.max(0, now - Date.parse(startedAt)) / 60_000);
  if (minutes < 1) return "under a minute";
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** What the popup shows about a raw D&D Beyond character: name, "High Elf · Wizard 2", and an https portrait. */
// A D&D Beyond id (a number, or digits), or null.
const ddbId = (v: unknown): string | null => (typeof v === "number" && Number.isInteger(v) && v > 0 ? String(v) : typeof v === "string" && /^[0-9]{1,20}$/.test(v) ? v : null);

export function characterSummary(raw: unknown): { name: string | null; summary: string; avatarUrl: string | null; ddbUserId: string | null; gameId: string | null; dmUserId: string | null } {
  const data = ((raw as { data?: unknown } | null)?.data ?? {}) as Record<string, unknown>;
  const name = typeof data.name === "string" && data.name.trim() ? data.name.trim().slice(0, 120) : null;
  const species = typeof (data.race as { fullName?: unknown } | undefined)?.fullName === "string" ? ((data.race as { fullName: string }).fullName.slice(0, 60)) : "";
  const classes = (Array.isArray(data.classes) ? data.classes : [])
    .map((c) => c as { level?: unknown; definition?: { name?: unknown } })
    .filter((c) => typeof c.definition?.name === "string")
    .map((c) => `${String(c.definition?.name).slice(0, 40)} ${typeof c.level === "number" ? c.level : ""}`.trim())
    .join(" / ");
  const avatar = (data.decorations as { avatarUrl?: unknown } | undefined)?.avatarUrl;
  const campaign = (data.campaign ?? {}) as { id?: unknown; dmUserId?: unknown };
  return {
    name,
    summary: [species, classes].filter(Boolean).join(" · "),
    avatarUrl: typeof avatar === "string" && /^https:\/\/[^\s"'<>]+$/.test(avatar) ? avatar.slice(0, 500) : null,
    // What a roll sent to D&D Beyond's game log is addressed with.
    ddbUserId: ddbId(data.userId),
    gameId: ddbId(campaign.id),
    dmUserId: ddbId(campaign.dmUserId),
  };
}

/** The log with one more line, newest last, at most MAX_LOG long. */
export const withLog = (log: LogEntry[], text: string, bad: boolean, at: string): LogEntry[] => [...log, { at, text, bad }].slice(-MAX_LOG);

/** "just now", "3 min ago"... for a time shown in the popup. */
export function ago(iso: string | null, now: number): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86_400)} d ago`;
}

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

/**
 * The toolbar badge, worked out from the state as it is now, so an old error never lingers. Only the
 * player's own characters that sync and show in the popup count; another player's is never a problem.
 */
export function badgeFor(state: SyncState): { text: string; color: string } {
  const ok = { color: "#3ddc97" };
  if (!state.portalUrl || !state.token) return { text: "", ...ok };
  const errors = Object.values(state.characters)
    .filter((c) => c.mine !== false && c.enabled && !c.hidden && c.lastError && !/read-only/i.test(c.lastError))
    .map((c) => ({ text: c.lastError as string, campaign: c.needsCampaign }));
  const bad = (text: string) => ({ text, color: "#ff6b81" });
  if (errors.some((e) => /token is no longer valid|does not accept this token/i.test(e.text))) return bad("AUTH");
  if (errors.some((e) => /sign in/i.test(e.text))) return bad("IN");
  if (errors.some((e) => !e.campaign)) return bad("!");
  if (errors.length > 0) return { text: "?", color: "#f7c04a" };
  return { text: state.settings.live ? "LIVE" : "", ...ok };
}

/** What an open D&D Beyond page says after the portal's HP change was saved (the page only shows it after a reload). */
export function hpNotice(write: { hp: number; tempHp: number; removed: number; successes: number; failures: number }): string {
  const temp = write.tempHp ? ` (+${write.tempHp} temp)` : "";
  const saves = write.successes || write.failures ? `, death saves ${write.successes} / ${write.failures}` : "";
  return `The portal set HP to ${write.hp} / ${write.hp + write.removed}${temp}${saves}. Reload to see it here.`;
}
