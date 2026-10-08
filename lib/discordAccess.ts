// Decides whether a Discord user may use the portal: member of the configured
// guild and holding at least one role the portal grants something to (see
// lib/access). Uses the user's own OAuth token (scope guilds.members.read), so
// the portal never needs a bot token of its own. The member's role ids come
// back with the answer; what they allow is decided against the grants.

export type AccessResult =
  | { kind: "allowed"; roleIds: string[] }
  // Definitive answer from Discord: not a member, missing role, or the token
  // was revoked. The session must end.
  | { kind: "denied"; reason: "not_member" | "missing_role" | "token_invalid" }
  // Discord could not answer (network, 5xx, rate limit). Not a verdict.
  | { kind: "unknown" };

type Options = {
  accessToken: string;
  guildId: string;
  // Whether this set of roles grants anything at all.
  allows: (roleIds: readonly string[]) => boolean;
  fetchImpl?: typeof fetch;
};

const SNOWFLAKE = /^\d{17,20}$/;
// Discord caps a guild at 250 roles; anything longer is not a real answer.
const MAX_ROLES = 250;

export async function checkDiscordAccess({
  accessToken,
  guildId,
  allows,
  fetchImpl = fetch,
}: Options): Promise<AccessResult> {
  let response: Response;
  try {
    response = await fetchImpl(
      `https://discord.com/api/v10/users/@me/guilds/${encodeURIComponent(guildId)}/member`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      },
    );
  } catch {
    return { kind: "unknown" };
  }

  if (response.status === 401 || response.status === 403) {
    return { kind: "denied", reason: "token_invalid" };
  }
  // Discord answers 404 (Unknown Guild / Unknown Member) when not a member.
  if (response.status === 404) return { kind: "denied", reason: "not_member" };
  if (!response.ok) return { kind: "unknown" };

  let member: unknown;
  try {
    member = await response.json();
  } catch {
    return { kind: "unknown" };
  }
  const roles =
    member && typeof member === "object" && Array.isArray((member as { roles?: unknown }).roles)
      ? ((member as { roles: unknown[] }).roles.filter((r) => typeof r === "string" && SNOWFLAKE.test(r)) as string[])
      : null;
  if (!roles || roles.length > MAX_ROLES) return { kind: "unknown" };

  return allows(roles) ? { kind: "allowed", roleIds: roles } : { kind: "denied", reason: "missing_role" };
}

// How often an existing session is re-verified against Discord, and how long a
// session may survive while Discord cannot be reached before it fails closed.
export const RECHECK_INTERVAL_MS = 5 * 60_000;
export const MAX_UNVERIFIED_MS = 30 * 60_000;

// `unverifiedSince`: when Discord first failed to answer for this session, if
// it has not answered since.
export type Verification = { verifiedAt: number; unverifiedSince?: number };

export type Decision =
  // roleIds: set when Discord was asked just now, so the caller can refresh them.
  | { kind: "keep"; verifiedAt: number; unverifiedSince?: number; roleIds?: string[] }
  // denied: Discord said no; the user's older sessions must die too.
  // unverified: Discord stayed unreachable too long; signing in again is fine.
  | { kind: "end"; reason: "denied" | "unverified" };

/**
 * Pure decision for an existing session.
 *
 * The outage window is counted from the first check Discord failed to answer,
 * not from the last successful one: a session that sat idle for hours and then
 * meets one rate-limited answer is not "unverified for hours".
 */
export async function reverify(state: Verification, now: number, check: () => Promise<AccessResult>): Promise<Decision> {
  if (now - state.verifiedAt < RECHECK_INTERVAL_MS) return { kind: "keep", verifiedAt: state.verifiedAt };
  const result = await check();
  if (result.kind === "allowed") return { kind: "keep", verifiedAt: now, roleIds: result.roleIds };
  if (result.kind === "denied") return { kind: "end", reason: "denied" };
  const since = state.unverifiedSince ?? now;
  return now - since < MAX_UNVERIFIED_MS
    ? { kind: "keep", verifiedAt: state.verifiedAt, unverifiedSince: since }
    : { kind: "end", reason: "unverified" };
}
