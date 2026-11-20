import { RateLimiter, type Limit } from "@/lib/rateLimit";
import { attemptLogin, type LoginDeps } from "./login";
import { makeToken, readToken } from "./secret";

export const TICKET_TTL_MS = 60_000;
export const DEVICE_TTL_MS = 90 * 24 * 60 * 60_000;
export const DEVICE_COOKIE = "totp_device";

// Per address, across every card: the per-card lockout stops guessing one card,
// this stops one address spraying many.
const IP_LIMIT: Limit = { max: 20, windowMs: 15 * 60_000 };

const SNOWFLAKE = /^\d{17,20}$/;

export type CodeSignInDeps = LoginDeps & { limiter: RateLimiter };

export type CodeSignInInput = {
  userId: string;
  code: string;
  /** The raw trusted-device cookie, if the browser sent one. */
  deviceCookie: string | undefined;
  ip: string;
  now: number;
};

/**
 * The whole code sign-in decision. On success: a one-minute ticket for Auth.js
 * (the credentials provider accepts nothing else) and a fresh trusted-device
 * token for the cookie. On any failure: null, and nothing says why.
 */
export function codeSignIn(deps: CodeSignInDeps, input: CodeSignInInput): { ticket: string; deviceToken: string } | null {
  const { userId, code, deviceCookie, ip, now } = input;
  if (!SNOWFLAKE.test(userId)) return null;
  if (deps.limiter.take(`totp:${ip}`, IP_LIMIT) > 0) return null;
  const trustedDevice = deviceCookie !== undefined && readToken("device", deviceCookie, deps.authSecret, now) === userId;
  if (!attemptLogin(deps, { userId, code: code.replace(/\s/g, ""), trustedDevice, now })) return null;
  return {
    ticket: makeToken("ticket", userId, TICKET_TTL_MS, deps.authSecret, now),
    deviceToken: makeToken("device", userId, DEVICE_TTL_MS, deps.authSecret, now),
  };
}
