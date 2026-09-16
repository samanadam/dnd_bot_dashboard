import NextAuth, { type DefaultSession } from "next-auth";
import Discord from "next-auth/providers/discord";
import { env } from "@/lib/env";
import { checkDiscordAccess, reverify } from "@/lib/discordAccess";
import { audit } from "@/lib/audit";

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
  }
}

// Server components cannot rewrite the session cookie, so a fresh verification
// is also remembered here to avoid re-asking Discord on every request.
const verifiedCache = new Map<string, number>();
const deniedUsers = new Map<string, number>();

const SESSION_MAX_AGE_S = 12 * 60 * 60;

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const config = env();

  const check = (accessToken: string) =>
    checkDiscordAccess({
      accessToken,
      guildId: config.ALLOWED_GUILD_ID,
      roleIds: config.ALLOWED_ROLE_IDS,
    });

  return {
    secret: config.AUTH_SECRET,
    providers: [
      Discord({
        clientId: config.AUTH_DISCORD_ID,
        clientSecret: config.AUTH_DISCORD_SECRET,
        // No email: the portal has no use for it. guilds.members.read lets us
        // read the user's own roles in the one allowed guild.
        authorization: { params: { scope: "identify guilds.members.read", prompt: "none" } },
        checks: ["pkce", "state"],
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
      async signIn({ account, profile }) {
        const userId = typeof profile?.id === "string" ? profile.id : undefined;
        if (account?.provider !== "discord" || !account.access_token || !userId) {
          return false;
        }
        const result = await check(account.access_token);
        const allowed = result.kind === "allowed";
        audit({ event: "sign_in", userId, outcome: allowed ? "allowed" : result.kind === "denied" ? result.reason : "discord_unreachable" });
        if (allowed) {
          deniedUsers.delete(userId);
          verifiedCache.set(userId, Date.now());
        }
        // Anyone else is rejected outright — there is no read-only tier.
        return allowed;
      },

      async jwt({ token, account, profile }) {
        if (account && profile) {
          // First call after a successful sign-in.
          return {
            sub: token.sub,
            name: token.name,
            picture: token.picture,
            discordId: String(profile.id),
            discordAccessToken: account.access_token,
            verifiedAt: Date.now(),
          };
        }

        const userId = token.discordId;
        if (!userId || !token.discordAccessToken || !token.verifiedAt) return null;
        if (deniedUsers.has(userId)) return null;

        const known = Math.max(token.verifiedAt, verifiedCache.get(userId) ?? 0);
        const accessToken = token.discordAccessToken;
        const next = await reverify({ verifiedAt: known }, Date.now(), async () => {
          const result = await check(accessToken);
          if (result.kind === "denied") {
            audit({ event: "session_revoked", userId, outcome: result.reason });
          }
          return result;
        });

        if (next === null) {
          deniedUsers.set(userId, Date.now());
          verifiedCache.delete(userId);
          return null;
        }
        verifiedCache.set(userId, next);
        return { ...token, verifiedAt: next };
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
