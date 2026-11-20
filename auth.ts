import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Discord from "next-auth/providers/discord";
import { env } from "@/lib/env";
import { UserRepo } from "@/lib/access/grants";
import { getDatabase } from "@/lib/dm/database";
import { readToken } from "@/lib/totp/secret";
import { totpSessionRoles } from "@/lib/totp/session";
import { checkDiscordAccess, reverify, type AccessResult } from "@/lib/discordAccess";
import { audit } from "@/lib/audit";
import { hasAnyAccess } from "@/lib/access/permissions";
import { accessFor, recordUser, rememberRoles, rolesOf } from "@/lib/access/store";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    discordId?: string;
    // Kept inside the encrypted session cookie (JWE, keyed by AUTH_SECRET) and
    // never copied into the session object that reaches the client.
    discordAccessToken?: string;
    verifiedAt?: number;
    // Set for sessions started with a code (no Discord token inside); see lib/totp.
    method?: "totp";
    // The member's Discord roles at the last check. Server-side only: never
    // copied into the session object (see the session callback).
    roleIds?: string[];
  }
}

// Server components cannot rewrite the session cookie, so a fresh verification
// is also remembered here to avoid re-asking Discord on every request.
//
// These maps are per module instance, and proxy.ts and the route handlers can
// each have their own. So nothing here may need another instance to undo it:
// a denial is a timestamp that only kills sessions verified before it, and a
// fresh sign-in (verified later) passes everywhere without clearing anything.
const verifiedCache = new Map<string, number>();
const deniedUsers = new Map<string, number>();
// When Discord first failed to answer for a user, while it keeps failing.
const unverifiedSince = new Map<string, number>();
// One Discord check per user at a time: a page load fires several requests at
// once, and letting each ask Discord is how a rate limit turns into a sign-out.
const inflightChecks = new Map<string, Promise<AccessResult>>();
// The newest roles a recheck found for a user, for requests whose cookie predates it.
const latestRoles = new Map<string, string[]>();

const SESSION_MAX_AGE_S = 12 * 60 * 60;


export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const config = env();

  // Allowed when the roles grant anything at all; what exactly is decided per
  // request from the grants (lib/access), so a grant edit applies at once.
  const check = (accessToken: string, userId: string) =>
    checkDiscordAccess({
      accessToken,
      guildId: config.ALLOWED_GUILD_ID,
      allows: (roleIds) => hasAnyAccess(accessFor(userId, roleIds)),
    });

  return {
    secret: config.AUTH_SECRET,
    providers: [
      Discord({
        clientId: config.AUTH_DISCORD_ID,
        clientSecret: config.AUTH_DISCORD_SECRET,
        // Discord now returns iss on the callback (RFC 9207) and Auth.js checks it
        // against the provider's issuer, which otherwise is a placeholder.
        // Value from https://discord.com/.well-known/oauth-authorization-server.
        issuer: "https://discord.com",
        // No email: the portal has no use for it. guilds.members.read lets us
        // read the user's own roles in the one allowed guild.
        authorization: { params: { scope: "identify guilds.members.read", prompt: "none" } },
        checks: ["pkce", "state"],
      }),
      // Sign in with an authenticator code instead of Discord (which some players
      // cannot reach). The code is checked, with lockout and replay protection, by
      // the /signin/code server action; this provider takes only the one-minute
      // ticket that action hands out, so it cannot be used to skip those checks.
      Credentials({
        id: "totp",
        credentials: { ticket: {} },
        authorize: async (credentials) => {
          const userId = readToken("ticket", String(credentials?.ticket ?? ""), config.AUTH_SECRET, Date.now());
          const stored = userId ? new UserRepo(getDatabase()).get(userId) : null;
          return userId && stored ? { id: userId, name: stored.displayName, image: stored.avatarUrl } : null;
        },
      }),
    ],
    session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_S, updateAge: 60 * 60 },
    pages: { signIn: "/signin", error: "/signin" },
    events: {
      // Revoke the Discord grant so a copied cookie cannot keep reading roles.
      async signOut(message) {
        const token = "token" in message ? message.token : null;
        if (!token?.discordAccessToken) return;
        if (token.discordId) verifiedCache.delete(token.discordId);
        try {
          await fetch("https://discord.com/api/oauth2/token/revoke", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              token: token.discordAccessToken,
              token_type_hint: "access_token",
              client_id: config.AUTH_DISCORD_ID,
              client_secret: config.AUTH_DISCORD_SECRET,
            }),
            signal: AbortSignal.timeout(5_000),
          });
        } catch {
          // Best effort: the session cookie is already cleared.
        }
      },
    },
    callbacks: {
      async signIn({ account, profile, user }) {
        if (account?.provider === "totp") {
          // authorize() already checked the ticket; the jwt callback checks access.
          audit({ event: "sign_in", userId: user?.id, outcome: "allowed_code" });
          return true;
        }
        const userId = typeof profile?.id === "string" ? profile.id : undefined;
        if (account?.provider !== "discord" || !account.access_token || !userId) {
          return false;
        }
        const result = await check(account.access_token, userId);
        const allowed = result.kind === "allowed";
        audit({ event: "sign_in", userId, outcome: allowed ? "allowed" : result.kind === "denied" ? result.reason : "discord_unreachable" });
        if (allowed) {
          deniedUsers.delete(userId);
          verifiedCache.set(userId, Date.now());
          // Handed to the jwt callback that runs next, and kept for the user list.
          rememberRoles(userId, result.roleIds);
          latestRoles.set(userId, result.roleIds);
          const avatar = typeof profile?.image_url === "string" ? profile.image_url : null;
          const name = typeof profile?.global_name === "string" ? profile.global_name : typeof profile?.username === "string" ? profile.username : null;
          recordUser(userId, name, avatar, result.roleIds);
        }
        // Anyone else is rejected outright — there is no read-only tier.
        return allowed;
      },

      async jwt({ token, account, profile, user }) {
        if (account?.provider === "totp" && user?.id) {
          const roleIds = totpSessionRoles(user.id);
          if (!roleIds) return null;
          return { sub: token.sub, name: token.name, picture: token.picture, discordId: user.id, method: "totp", verifiedAt: Date.now(), roleIds };
        }
        if (token.method === "totp") {
          // No Discord token to re-check: the card and the grants are re-read instead.
          const roleIds = token.discordId ? totpSessionRoles(token.discordId) : null;
          if (!token.discordId || !roleIds) {
            audit({ event: "session_revoked", userId: token.discordId, outcome: "code_signin_off" });
            return null;
          }
          return { ...token, roleIds };
        }
        if (account && profile) {
          // First call after a successful sign-in.
          return {
            sub: token.sub,
            name: token.name,
            picture: token.picture,
            discordId: String(profile.id),
            discordAccessToken: account.access_token,
            verifiedAt: Date.now(),
            // The roles the sign-in check just saw.
            roleIds: rolesOf(String(profile.id)),
          };
        }

        const userId = token.discordId;
        if (!userId || !token.discordAccessToken || !token.verifiedAt) return null;
        // Sessions verified before a denial stay dead; a later sign-in is new.
        const deniedAt = deniedUsers.get(userId);
        if (deniedAt !== undefined && token.verifiedAt <= deniedAt) return null;

        const known = Math.max(token.verifiedAt, verifiedCache.get(userId) ?? 0);
        const accessToken = token.discordAccessToken;
        const sharedCheck = () => {
          let running = inflightChecks.get(userId);
          if (!running) {
            running = check(accessToken, userId)
              .then((result) => {
                if (result.kind === "denied") audit({ event: "session_revoked", userId, outcome: result.reason });
                return result;
              })
              .finally(() => inflightChecks.delete(userId));
            inflightChecks.set(userId, running);
          }
          return running;
        };
        const decision = await reverify({ verifiedAt: known, unverifiedSince: unverifiedSince.get(userId) }, Date.now(), sharedCheck);

        if (decision.kind === "end") {
          verifiedCache.delete(userId);
          unverifiedSince.delete(userId);
          if (decision.reason === "denied") deniedUsers.set(userId, Date.now());
          else audit({ event: "session_revoked", userId, outcome: "discord_unreachable" });
          return null;
        }
        verifiedCache.set(userId, decision.verifiedAt);
        if (decision.unverifiedSince !== undefined) unverifiedSince.set(userId, decision.unverifiedSince);
        else unverifiedSince.delete(userId);

        // Fresh roles from this check, or the ones last seen (by this cookie, or by
        // a newer check another request made and could not write into the cookie).
        const roleIds = decision.roleIds ?? latestRoles.get(userId) ?? token.roleIds ?? [];
        if (decision.roleIds) {
          latestRoles.set(userId, decision.roleIds);
          recordUser(userId, token.name, token.picture, decision.roleIds);
        }
        // Grants can be taken away in the dashboard at any moment: nothing left, no session.
        if (!hasAnyAccess(accessFor(userId, roleIds))) {
          audit({ event: "session_revoked", userId, outcome: "no_grant" });
          return null;
        }
        rememberRoles(userId, roleIds);
        return { ...token, verifiedAt: decision.verifiedAt, roleIds };
      },

      session({ session, token }) {
        // Explicit allowlist of what the browser may learn about the session.
        return {
          expires: session.expires,
          user: {
            id: token.discordId ?? "",
            name: session.user?.name ?? null,
            image: session.user?.image ?? null,
          },
        } as typeof session;
      },
    },
  };
});
