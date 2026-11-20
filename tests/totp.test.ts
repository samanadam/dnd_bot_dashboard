import * as OTPAuth from "otpauth";
import { describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/dm/db";
import { RateLimiter } from "@/lib/rateLimit";
import { attemptLogin, LOCK_MS, MAX_FAILS } from "@/lib/totp/login";
import { codeSignIn } from "@/lib/totp/signin";
import { TotpRepo } from "@/lib/totp/repo";
import { checkCode, decryptSecret, encryptSecret, makeToken, newSecret, otpauthUri, readToken } from "@/lib/totp/secret";

const KEY = "k".repeat(40);
const USER = "111111111111111111";
const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);

const codeAt = (secret: string, ms: number) =>
  new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 }).generate({ timestamp: ms });

describe("secret handling", () => {
  it("round-trips an encrypted secret and refuses a tampered or wrongly keyed one", () => {
    const secret = newSecret();
    const blob = encryptSecret(secret, KEY);
    expect(blob).not.toContain(secret);
    expect(decryptSecret(blob, KEY)).toBe(secret);
    expect(decryptSecret(blob, "z".repeat(40))).toBeNull();
    expect(decryptSecret(blob.slice(0, -4) + "AAAA", KEY)).toBeNull();
  });

  it("gives each encryption a different blob", () => {
    expect(encryptSecret("ABC", KEY)).not.toBe(encryptSecret("ABC", KEY));
  });

  it("accepts the current code and one step either side, with its counter", () => {
    const secret = newSecret();
    const counter = Math.floor(NOW / 30_000);
    expect(checkCode(secret, codeAt(secret, NOW), NOW)).toBe(counter);
    expect(checkCode(secret, codeAt(secret, NOW - 30_000), NOW)).toBe(counter - 1);
    expect(checkCode(secret, codeAt(secret, NOW + 30_000), NOW)).toBe(counter + 1);
    expect(checkCode(secret, codeAt(secret, NOW - 90_000), NOW)).toBeNull();
  });

  it("rejects codes that are not six digits", () => {
    const secret = newSecret();
    expect(checkCode(secret, "12345", NOW)).toBeNull();
    expect(checkCode(secret, "abcdef", NOW)).toBeNull();
    expect(checkCode(secret, "", NOW)).toBeNull();
  });

  it("builds an otpauth uri an authenticator app understands", () => {
    const uri = otpauthUri("JBSWY3DPEHPK3PXP", "Ann");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=Portal");
  });

  it("signs tokens per purpose, user and expiry", () => {
    const token = makeToken("ticket", USER, 60_000, KEY, NOW);
    expect(readToken("ticket", token, KEY, NOW + 59_000)).toBe(USER);
    expect(readToken("ticket", token, KEY, NOW + 61_000)).toBeNull();
    expect(readToken("device", token, KEY, NOW)).toBeNull();
    expect(readToken("ticket", token, "z".repeat(40), NOW)).toBeNull();
    expect(readToken("ticket", token.replace(USER, "222222222222222222"), KEY, NOW)).toBeNull();
    expect(readToken("ticket", "garbage", KEY, NOW)).toBeNull();
  });
});

function setup() {
  const db = openDatabase(":memory:");
  const repo = new TotpRepo(db);
  const secret = newSecret();
  repo.startSetup(USER, encryptSecret(secret, KEY), NOW);
  repo.activate(USER, 0);
  const state = { allowed: true };
  const deps = { repo, authSecret: KEY, allowed: () => state.allowed };
  return { db, repo, secret, state, deps };
}

describe("code sign-in", () => {
  it("accepts a valid code once and refuses the same code again", async () => {
    const { deps, secret } = setup();
    const code = codeAt(secret, NOW);
    expect(attemptLogin(deps, { userId: USER, code, trustedDevice: false, now: NOW })).toBe(true);
    expect(attemptLogin(deps, { userId: USER, code, trustedDevice: false, now: NOW })).toBe(false);
  });

  it("refuses a card with no active credential, or one still being set up", () => {
    const { deps, repo } = setup();
    expect(attemptLogin(deps, { userId: "999999999999999999", code: "123456", trustedDevice: false, now: NOW })).toBe(false);
    repo.startSetup(USER, encryptSecret(newSecret(), KEY), NOW); // back to pending
    expect(attemptLogin(deps, { userId: USER, code: "123456", trustedDevice: false, now: NOW })).toBe(false);
  });

  it("locks a card for 15 minutes after five wrong codes, even for the right code", () => {
    const { deps, secret } = setup();
    for (let i = 0; i < MAX_FAILS; i++) expect(attemptLogin(deps, { userId: USER, code: "000000", trustedDevice: false, now: NOW })).toBe(false);
    const good = codeAt(secret, NOW + 1_000);
    expect(attemptLogin(deps, { userId: USER, code: good, trustedDevice: false, now: NOW + 1_000 })).toBe(false);
    const later = NOW + LOCK_MS + 60_000;
    expect(attemptLogin(deps, { userId: USER, code: codeAt(secret, later), trustedDevice: false, now: later })).toBe(true);
  });

  it("lets a trusted device in while the card is locked for strangers", () => {
    const { deps, secret } = setup();
    for (let i = 0; i < MAX_FAILS; i++) attemptLogin(deps, { userId: USER, code: "000000", trustedDevice: false, now: NOW });
    expect(attemptLogin(deps, { userId: USER, code: codeAt(secret, NOW), trustedDevice: true, now: NOW })).toBe(true);
  });

  it("clears the failure count after a success", () => {
    const { deps, secret } = setup();
    for (let i = 0; i < MAX_FAILS - 1; i++) attemptLogin(deps, { userId: USER, code: "000000", trustedDevice: false, now: NOW });
    expect(attemptLogin(deps, { userId: USER, code: codeAt(secret, NOW), trustedDevice: false, now: NOW })).toBe(true);
    for (let i = 0; i < MAX_FAILS - 1; i++) attemptLogin(deps, { userId: USER, code: "000000", trustedDevice: false, now: NOW + 60_000 });
    expect(attemptLogin(deps, { userId: USER, code: codeAt(secret, NOW + 90_000), trustedDevice: false, now: NOW + 90_000 })).toBe(true);
  });

  it("refuses when the user's access is gone", () => {
    const { deps, secret, state } = setup();
    state.allowed = false;
    expect(attemptLogin(deps, { userId: USER, code: codeAt(secret, NOW), trustedDevice: false, now: NOW })).toBe(false);
  });

  it("refuses a credential that cannot be decrypted", () => {
    const { deps, secret } = setup();
    expect(attemptLogin({ ...deps, authSecret: "z".repeat(40) }, { userId: USER, code: codeAt(secret, NOW), trustedDevice: false, now: NOW })).toBe(false);
  });
});

describe("TotpRepo", () => {
  it("lists only active cards and removes on request", () => {
    const { repo } = setup();
    repo.startSetup("222222222222222222", encryptSecret(newSecret(), KEY), NOW);
    expect(repo.activeUserIds()).toEqual([USER]);
    repo.remove(USER);
    expect(repo.activeUserIds()).toEqual([]);
    expect(repo.get(USER)).toBeNull();
  });

  it("advances the counter only forward", () => {
    const { repo } = setup();
    expect(repo.advanceCounter(USER, 10)).toBe(true);
    expect(repo.advanceCounter(USER, 10)).toBe(false);
    expect(repo.advanceCounter(USER, 9)).toBe(false);
    expect(repo.advanceCounter(USER, 11)).toBe(true);
  });
});

describe("codeSignIn", () => {
  const ip = "203.0.113.7";
  const make = () => {
    const base = setup();
    return { ...base, deps: { ...base.deps, limiter: new RateLimiter() } };
  };

  it("hands back a ticket for the user and a device token on success", () => {
    const { deps, secret } = make();
    const result = codeSignIn(deps, { userId: USER, code: codeAt(secret, NOW), deviceCookie: undefined, ip, now: NOW });
    expect(result).not.toBeNull();
    expect(readToken("ticket", result!.ticket, KEY, NOW)).toBe(USER);
    expect(readToken("device", result!.deviceToken, KEY, NOW)).toBe(USER);
  });

  it("tolerates spaces in the typed code", () => {
    const { deps, secret } = make();
    const code = codeAt(secret, NOW);
    expect(codeSignIn(deps, { userId: USER, code: `${code.slice(0, 3)} ${code.slice(3)}`, deviceCookie: undefined, ip, now: NOW })).not.toBeNull();
  });

  it("treats a device cookie for another user as untrusted", () => {
    const { deps, secret } = make();
    for (let i = 0; i < MAX_FAILS; i++) codeSignIn(deps, { userId: USER, code: "000000", deviceCookie: undefined, ip: `10.0.0.${i}`, now: NOW });
    const other = makeToken("device", "222222222222222222", 1000, KEY, NOW);
    expect(codeSignIn(deps, { userId: USER, code: codeAt(secret, NOW), deviceCookie: other, ip, now: NOW })).toBeNull();
    const own = makeToken("device", USER, 1000, KEY, NOW);
    expect(codeSignIn(deps, { userId: USER, code: codeAt(secret, NOW), deviceCookie: own, ip, now: NOW })).not.toBeNull();
  });

  it("stops one address after 20 tries across any cards", () => {
    const { deps, secret } = make();
    for (let i = 0; i < 20; i++) codeSignIn(deps, { userId: "999999999999999999", code: "000000", deviceCookie: undefined, ip, now: NOW });
    expect(codeSignIn(deps, { userId: USER, code: codeAt(secret, NOW), deviceCookie: undefined, ip, now: NOW })).toBeNull();
    expect(codeSignIn(deps, { userId: USER, code: codeAt(secret, NOW), deviceCookie: undefined, ip: "198.51.100.1", now: NOW })).not.toBeNull();
  });

  it("refuses a malformed user id without touching the database", () => {
    const { deps } = make();
    expect(codeSignIn(deps, { userId: "x'; DROP TABLE", code: "123456", deviceCookie: undefined, ip, now: NOW })).toBeNull();
  });
});
