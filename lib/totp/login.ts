import { checkCode, decryptSecret } from "./secret";
import { LOCK_MS, MAX_FAILS, type TotpRepo } from "./repo";

export { LOCK_MS, MAX_FAILS };

export type LoginDeps = {
  repo: TotpRepo;
  authSecret: string;
  /** Whether the user's roles and grants still let them into the portal. */
  allowed: (userId: string) => boolean;
};

/**
 * Check a code for a card. One answer for every kind of failure, so a stranger
 * learns nothing about which cards exist, are locked or are mid-setup.
 *
 * A locked card refuses everyone except a device that already signed in as that
 * user (trustedDevice), so a stranger cannot lock the owner out of their own
 * phone. A code is accepted once: its counter must be newer than the last one.
 */
export function attemptLogin(deps: LoginDeps, input: { userId: string; code: string; trustedDevice: boolean; now: number }): boolean {
  const { repo, authSecret, allowed } = deps;
  const { userId, code, trustedDevice, now } = input;
  const credential = repo.get(userId);
  if (!credential || credential.status !== "active") return false;
  if (!trustedDevice && repo.lockedUntil(userId) > now) return false;
  const secret = decryptSecret(credential.secretEnc, authSecret);
  if (!secret) return false;
  const counter = checkCode(secret, code, now);
  if (counter === null) {
    repo.recordFail(userId, now);
    return false;
  }
  if (!repo.advanceCounter(userId, counter)) return false;
  if (!allowed(userId)) return false;
  repo.clearFails(userId);
  return true;
}
