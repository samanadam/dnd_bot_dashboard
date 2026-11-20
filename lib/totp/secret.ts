import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import * as OTPAuth from "otpauth";

// Authenticator secrets are stored encrypted (AES-256-GCM, key derived from
// AUTH_SECRET) so a database backup alone cannot produce a code. The same
// secret signs the short-lived sign-in ticket and the trusted-device cookie.
// Rotating AUTH_SECRET invalidates both: players simply set the code up again.

const key = (authSecret: string, info: string) => Buffer.from(hkdfSync("sha256", authSecret, "", info, 32));

export function encryptSecret(plain: string, authSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(authSecret, "totp-secret-v1"), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** The secret, or null when the blob was tampered with or the key is wrong. */
export function decryptSecret(blob: string, authSecret: string): string | null {
  try {
    const raw = Buffer.from(blob, "base64url");
    if (raw.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(authSecret, "totp-secret-v1"), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export const newSecret = (): string => new OTPAuth.Secret({ size: 20 }).base32;

const totp = (secret: string, label = "player") =>
  new OTPAuth.TOTP({ issuer: "Portal", label, secret: OTPAuth.Secret.fromBase32(secret), algorithm: "SHA1", digits: 6, period: 30 });

export const otpauthUri = (secret: string, label: string): string => totp(secret, label).toString();

/** The counter the code matched (current step, or one either side), or null. */
export function checkCode(secret: string, code: string, nowMs: number): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const delta = totp(secret).validate({ token: code, timestamp: nowMs, window: 1 });
  return delta === null ? null : Math.floor(nowMs / 30_000) + delta;
}

const SNOWFLAKE = /^\d{17,20}$/;
const sign = (kind: string, userId: string, exp: number, authSecret: string) =>
  createHmac("sha256", key(authSecret, "totp-token-v1")).update(`${kind}.${userId}.${exp}`).digest("base64url");

/** A signed "userId.expiry.signature" token, valid for one purpose only. */
export function makeToken(kind: "ticket" | "device", userId: string, ttlMs: number, authSecret: string, nowMs: number): string {
  const exp = nowMs + ttlMs;
  return `${userId}.${exp}.${sign(kind, userId, exp, authSecret)}`;
}

/** The user id inside a valid, unexpired token of this kind; otherwise null. */
export function readToken(kind: "ticket" | "device", token: string, authSecret: string, nowMs: number): string | null {
  const [userId, expText, signature, ...rest] = token.split(".");
  if (rest.length > 0 || !userId || !SNOWFLAKE.test(userId) || !/^\d{1,16}$/.test(expText ?? "") || !signature) return null;
  const exp = Number(expText);
  const expected = Buffer.from(sign(kind, userId, exp, authSecret));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return exp > nowMs ? userId : null;
}
