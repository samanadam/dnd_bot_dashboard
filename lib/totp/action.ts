import "server-only";
import { cookies, headers } from "next/headers";
import { UserRepo } from "@/lib/access/grants";
import { hasAnyAccess } from "@/lib/access/permissions";
import { accessFor } from "@/lib/access/store";
import { audit } from "@/lib/audit";
import { getDatabase } from "@/lib/dm/database";
import { env } from "@/lib/env";
import { RateLimiter } from "@/lib/rateLimit";
import { TotpRepo } from "./repo";
import { codeSignIn, DEVICE_COOKIE, DEVICE_TTL_MS } from "./signin";

const limiter = new RateLimiter();

/** The players who set up code sign-in: the cards on /signin/code. Public by design: names and avatars only. */
export function codeCards(): { userId: string; displayName: string; avatarUrl: string | null }[] {
  const db = getDatabase();
  const users = new UserRepo(db);
  return new TotpRepo(db)
    .activeUserIds()
    .flatMap((id) => users.get(id) ?? [])
    .map(({ userId, displayName, avatarUrl }) => ({ userId, displayName, avatarUrl }));
}

/** Check a typed code for a card. A ticket for Auth.js on success (and the device cookie is set); null on any failure. */
export async function verifyCodeSignIn(userId: string, code: string): Promise<string | null> {
  const [jar, incoming] = await Promise.all([cookies(), headers()]);
  const db = getDatabase();
  const result = codeSignIn(
    {
      repo: new TotpRepo(db),
      authSecret: env().AUTH_SECRET,
      limiter,
      allowed: (id) => {
        const stored = new UserRepo(db).get(id);
        return stored !== null && hasAnyAccess(accessFor(id, stored.roleIds));
      },
    },
    {
      userId,
      code,
      deviceCookie: jar.get(DEVICE_COOKIE)?.value,
      ip: incoming.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
      now: Date.now(),
    },
  );
  audit({ event: "sign_in", userId: userId.slice(0, 20), outcome: result ? "code_ok" : "code_refused" });
  if (!result) return null;
  jar.set(DEVICE_COOKIE, result.deviceToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_TTL_MS / 1000,
  });
  return result.ticket;
}
