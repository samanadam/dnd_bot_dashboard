import { can, campaignsFor, type Access, type Permission } from "@/lib/access/permissions";
import type { ScopedSelection, Selection } from "@/lib/campaign/selection";
import { RateLimiter, type Limit } from "@/lib/rateLimit";
import { errorResponse, isSameOrigin, PORTAL_HEADER, readLimited } from "@/lib/requestGuard";

// Every /api/dm route (and every other portal API route that is not the bot
// proxy) runs this first, in this order: session, permission, same-origin portal
// request, rate limit. Nothing touches the database before it passes.

export type DmBucket = "dm_read" | "dm_write";

export type DmGuardDeps = {
  // The signed-in user's access; null when nobody is signed in.
  getAccess: () => Promise<Access | null>;
  limiter?: RateLimiter;
};

export const DM_LIMITS: Record<DmBucket, Limit> = {
  dm_read: { max: 240, windowMs: 60_000 },
  dm_write: { max: 120, windowMs: 60_000 },
};

// Stat blocks with long legendary actions and encounters with 60 combatants fit
// comfortably; anything bigger is a mistake or an attempt.
export const DM_MAX_BODY_BYTES = 64 * 1024;

const sharedLimiter = new RateLimiter();

type Refusal = { ok: false; response: Response };

/**
 * The campaigns a permission reaches, as the handlers need it. A user granted a
 * permission in named campaigns only never sees content filed elsewhere or
 * under no campaign; for the owner and "all campaigns" grants nothing narrows.
 */
export type CampaignScope = {
  readonly everywhere: boolean;
  /** May this row (by its campaign, null for none) be read or changed? */
  allows(campaignId: string | null): boolean;
  /**
   * The selection a list may use, or undefined when the request asks outside the
   * scope. (null is a real answer: every campaign.)
   */
  narrow(selection: Selection): ScopedSelection | undefined;
};

export function campaignScope(access: Access, permission: Permission): CampaignScope {
  const scope = campaignsFor(access, permission);
  if (scope === "all") return { everywhere: true, allows: () => true, narrow: (selection) => selection };
  const ids = scope ? [...scope].sort() : [];
  return {
    everywhere: false,
    allows: (campaignId) => campaignId !== null && can(access, permission, campaignId),
    narrow: (selection) => {
      if (selection === null) return ids;
      if (selection === "unassigned") return undefined;
      return ids.includes(selection) ? selection : undefined;
    },
  };
}

export type Guarded = { ok: true; userId: string; access: Access; scope: CampaignScope };

export async function guardApi(
  request: Request,
  deps: DmGuardDeps,
  permission: Permission | "owner" | "signed-in",
  // Image GETs from <img>, which cannot send the portal header. Still same-origin only.
  options: { image?: boolean } = {},
): Promise<Guarded | Refusal> {
  const access = await deps.getAccess();
  if (!access) return { ok: false, response: errorResponse(401, "unauthorized", "Sign in required.") };
  // The same answer as an unknown URL: other portal users learn nothing.
  const allowed = permission === "signed-in" ? true : permission === "owner" ? access.owner : can(access, permission);
  if (!allowed) return { ok: false, response: errorResponse(404, "not_found", "Unknown endpoint.") };
  const headerOk = request.headers.get(PORTAL_HEADER) === "1" || (options.image === true && request.method.toUpperCase() === "GET");
  if (!headerOk || !isSameOrigin(request)) {
    return { ok: false, response: errorResponse(403, "forbidden", "Cross-origin request refused.") };
  }
  const bucket: DmBucket = request.method.toUpperCase() === "GET" ? "dm_read" : "dm_write";
  const wait = (deps.limiter ?? sharedLimiter).take(`${access.userId}:${bucket}`, DM_LIMITS[bucket]);
  if (wait > 0) {
    return {
      ok: false,
      response: errorResponse(429, "rate_limited", "Too many requests. Slow down.", { "Retry-After": String(wait) }),
    };
  }
  const scoped: Permission = permission === "owner" || permission === "signed-in" ? "dm" : permission;
  return { ok: true, userId: access.userId, access, scope: campaignScope(access, scoped) };
}

/** The DM tools' gate: the `dm` permission, scoped to the user's campaigns. */
export function guardDm(request: Request, deps: DmGuardDeps): Promise<Guarded | Refusal> {
  return guardApi(request, deps, "dm");
}

export async function readDmJson(request: Request, limit: number = DM_MAX_BODY_BYTES): Promise<{ ok: true; json: unknown } | Refusal> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return { ok: false, response: errorResponse(415, "unsupported_media_type", "Expected application/json.") };
  }
  const text = await readLimited(request, limit);
  if (text === null) return { ok: false, response: errorResponse(413, "payload_too_large", "Request body too large.") };
  try {
    return { ok: true, json: JSON.parse(text) };
  } catch {
    return { ok: false, response: errorResponse(400, "bad_request", "Malformed JSON.") };
  }
}

export function invalidBody(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Response {
  const issue = issues[0];
  const where = issue?.path.map(String).join(".") || "body";
  return errorResponse(400, "bad_request", `Invalid ${where}: ${issue?.message ?? "invalid"}`);
}

/** The answer for a campaign outside the caller's scope: the same as "no such thing". */
export function outOfScope(what = "thing"): Response {
  return errorResponse(404, "not_found", `No such ${what}.`);
}
