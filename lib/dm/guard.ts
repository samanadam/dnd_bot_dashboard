import { RateLimiter, type Limit } from "@/lib/rateLimit";
import { errorResponse, isSameOrigin, PORTAL_HEADER, readLimited } from "@/lib/requestGuard";
import { isDm } from "./isDm";

// Every /api/dm route runs this first, in this order: session, DM allowlist,
// same-origin portal request, rate limit. Nothing touches the database before
// it passes.

export type DmBucket = "dm_read" | "dm_write";

export type DmGuardDeps = {
  getUserId: () => Promise<string | null>;
  dmIds: readonly string[];
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

export async function guardDm(request: Request, deps: DmGuardDeps): Promise<{ ok: true; userId: string } | Refusal> {
  const userId = await deps.getUserId();
  if (!userId) return { ok: false, response: errorResponse(401, "unauthorized", "Sign in required.") };
  // The same answer as an unknown URL: other portal users learn nothing.
  if (!isDm(userId, deps.dmIds)) return { ok: false, response: errorResponse(404, "not_found", "Unknown endpoint.") };
  if (request.headers.get(PORTAL_HEADER) !== "1" || !isSameOrigin(request)) {
    return { ok: false, response: errorResponse(403, "forbidden", "Cross-origin request refused.") };
  }
  const bucket: DmBucket = request.method.toUpperCase() === "GET" ? "dm_read" : "dm_write";
  const wait = (deps.limiter ?? sharedLimiter).take(`${userId}:${bucket}`, DM_LIMITS[bucket]);
  if (wait > 0) {
    return {
      ok: false,
      response: errorResponse(429, "rate_limited", "Too many requests. Slow down.", { "Retry-After": String(wait) }),
    };
  }
  return { ok: true, userId };
}

export async function readDmJson(request: Request): Promise<{ ok: true; json: unknown } | Refusal> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return { ok: false, response: errorResponse(415, "unsupported_media_type", "Expected application/json.") };
  }
  const text = await readLimited(request, DM_MAX_BODY_BYTES);
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
