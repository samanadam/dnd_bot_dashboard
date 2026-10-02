import { CAMPAIGN_COOKIE } from "@/lib/campaign/selection";
import { THEME_COOKIE } from "@/lib/theme";

// Cookie and storage consent. Two categories:
//
//   necessary    sign-in session, CSRF/state checks, and this consent record.
//                Always on, no choice offered.
//   preferences  keeping theme, campaign and remembered channel ids for a year
//                instead of for the browser session.
//
// There is no analytics or advertising category because nothing here sets such
// a cookie. If one is ever added, add it to CATEGORIES, bump CONSENT_VERSION so
// everyone is asked again, and gate the new code on hasConsent().

export const CONSENT_COOKIE = "portal_consent";
export const CONSENT_VERSION = 1;
const CONSENT_MAX_AGE_S = 180 * 24 * 60 * 60;
const PREFERENCE_MAX_AGE_S = 365 * 24 * 60 * 60;

export const CATEGORIES = ["necessary", "preferences"] as const;
export type Category = (typeof CATEGORIES)[number];

export type Consent = { v: number; preferences: boolean; at: number };

/** Event the "Cookie settings" buttons fire to reopen the banner. */
export const CONSENT_OPEN_EVENT = "portal:consent-open";

export function parseConsent(raw: string | undefined | null): Consent | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(decodeURIComponent(raw));
    if (!value || typeof value !== "object") return null;
    const { v, preferences, at } = value as Partial<Consent>;
    // An older version means the categories changed: ask again.
    if (v !== CONSENT_VERSION || typeof preferences !== "boolean" || typeof at !== "number") return null;
    return { v, preferences, at };
  } catch {
    return null;
  }
}

export function serializeConsent(consent: Consent): string {
  return encodeURIComponent(JSON.stringify(consent));
}

function rawCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  for (const part of document.cookie.split("; ")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq) === name) return part.slice(eq + 1);
  }
  return undefined;
}

const secureFlag = () => (typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "");

const listeners = new Set<() => void>();

/** useSyncExternalStore plumbing: the raw cookie string is the snapshot. */
export function subscribeConsent(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export const consentSnapshot = () => rawCookie(CONSENT_COOKIE) ?? "";

export function readConsent(): Consent | null {
  return parseConsent(rawCookie(CONSENT_COOKIE));
}

export function hasConsent(category: Category): boolean {
  if (category === "necessary") return true;
  return readConsent()?.preferences === true;
}

/**
 * Lifetime for a preference cookie: a year with consent, otherwise no Max-Age,
 * which makes it a session cookie. A choice the visitor just made (a theme, a
 * campaign) still works for the visit; it is only not kept afterwards.
 */
export function preferenceCookieLifetime(): string {
  return hasConsent("preferences") ? `; Max-Age=${PREFERENCE_MAX_AGE_S}` : "";
}

/** localStorage with consent, sessionStorage without. Can throw: callers catch. */
export function preferenceStorage(): Storage {
  return hasConsent("preferences") ? window.localStorage : window.sessionStorage;
}

// Keys written through preferenceStorage() or useLocalValue().
const isPreferenceKey = (key: string) => key.startsWith("portal.") || key.startsWith("demo.portal.") || key === "dm-dice-autosend";

function demoteToSession() {
  try {
    for (const name of [THEME_COOKIE, CAMPAIGN_COOKIE]) {
      const value = rawCookie(name);
      if (value !== undefined) document.cookie = `${name}=${value}; Path=/; SameSite=Lax${secureFlag()}`;
    }
    const kept: [string, string][] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && isPreferenceKey(key)) kept.push([key, window.localStorage.getItem(key) ?? ""]);
    }
    for (const [key, value] of kept) {
      window.sessionStorage.setItem(key, value);
      window.localStorage.removeItem(key);
    }
  } catch {
    // Storage blocked: nothing was kept there to begin with.
  }
}

function promoteToPersistent() {
  try {
    for (const name of [THEME_COOKIE, CAMPAIGN_COOKIE]) {
      const value = rawCookie(name);
      if (value !== undefined) document.cookie = `${name}=${value}; Path=/; Max-Age=${PREFERENCE_MAX_AGE_S}; SameSite=Lax${secureFlag()}`;
    }
  } catch {
    // Cookies blocked: the choice simply is not kept.
  }
}

/** Records the visitor's choice and moves what is already stored to match it. */
export function saveConsent(preferences: boolean) {
  const consent: Consent = { v: CONSENT_VERSION, preferences, at: Date.now() };
  document.cookie = `${CONSENT_COOKIE}=${serializeConsent(consent)}; Path=/; Max-Age=${CONSENT_MAX_AGE_S}; SameSite=Lax${secureFlag()}`;
  if (preferences) promoteToPersistent();
  else demoteToSession();
  listeners.forEach((listener) => listener());
}

export function openConsentSettings() {
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}
