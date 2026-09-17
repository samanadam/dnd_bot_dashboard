import { matchRule, type RateBucket } from "./allowlist";
import type { Limit } from "../rateLimit";
import { RateLimiter } from "../rateLimit";
import { errorResponse, isSameOrigin, PORTAL_HEADER, readLimited } from "../requestGuard";

// The request pipeline behind /api/bot/[...path]. Dependencies are injected so
// every refusal path is unit-tested without a bot or a Discord session.
//
// Order matters: authenticate, check it is a same-origin portal request,
// resolve against the allowlist, rate-limit, validate input, and only then
// build an upstream request from validated values.

export type ProxyDeps = {
  getUserId: () => Promise<string | null>;
  botUrl: string;
  botToken: string;
  fetchImpl?: typeof fetch;
  limiter?: RateLimiter;
  log?: (entry: { event: "bot_call" | "bot_refused"; userId?: string; method: string; path: string; status: number; detail?: string }) => void;
  cache?: ReadCache;
  now?: () => number;
};

// Every portal user acts through the same bot token, and the bot allows 60
// requests a minute for that token. Reads are therefore shared for a moment
// across all signed-in users and tabs: the bot sees at most one call per
// endpoint per READ_CACHE_MS however many dashboards are open. Every admin is
// entitled to the same data, so sharing exposes nothing. Any successful change
// clears the cache so the next read is fresh.
export const READ_CACHE_MS = 2_000;

type Snapshot = { status: number; body: string; retryAfter?: string };

export class ReadCache {
  private entries = new Map<string, { expires: number; snapshot: Snapshot }>();
  private inflight = new Map<string, Promise<Snapshot>>();

  get(key: string, now: number) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.snapshot;
  }

  /** Runs load once for concurrent callers of the same key. */
  async shared(key: string, now: () => number, load: () => Promise<Snapshot>): Promise<Snapshot> {
    const cached = this.get(key, now());
    if (cached) return cached;
    const running = this.inflight.get(key);
    if (running) return running;
    const promise = load()
      .then((snapshot) => {
        if (snapshot.status === 200) this.entries.set(key, { expires: now() + READ_CACHE_MS, snapshot });
        return snapshot;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  clear() {
    this.entries.clear();
  }
}

const sharedCache = new ReadCache();

export { PORTAL_HEADER };
export const MAX_BODY_BYTES = 8 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;

export const LIMITS: Record<RateBucket, Limit> = {
  read: { max: 120, windowMs: 60_000 },
  control: { max: 60, windowMs: 60_000 },
  recording: { max: 10, windowMs: 60_000 },
};

const sharedLimiter = new RateLimiter();

export async function handleBotRequest(
  request: Request,
  segments: readonly string[],
  deps: ProxyDeps,
): Promise<Response> {
  const method = request.method.toUpperCase();
  const displayPath = segments.join("/").slice(0, 120);
  const log = deps.log ?? (() => {});

  // 1. Session. Checked before anything else so unauthenticated callers learn
  //    nothing about which paths exist.
  const userId = await deps.getUserId();
  if (!userId) return errorResponse(401, "unauthorized", "Sign in required.");

  // 2. Only the portal's own pages may call this. The custom header forces a
  //    CORS preflight for any cross-site attempt (which we never answer), and
  //    Sec-Fetch-Site/Origin stop CSRF from same-site subdomains.
  if (request.headers.get(PORTAL_HEADER) !== "1" || !isSameOrigin(request)) {
    log({ event: "bot_refused", userId, method, path: displayPath, status: 403, detail: "cross_origin" });
    return errorResponse(403, "forbidden", "Cross-origin request refused.");
  }

  // 3. Allowlist.
  const match = matchRule(method, segments);
  if (!match) {
    log({ event: "bot_refused", userId, method, path: displayPath, status: 404, detail: "not_allowlisted" });
    return errorResponse(404, "not_found", "Unknown endpoint.");
  }
  const { rule, path } = match;

  // 4. Rate limit, per user and bucket.
  const wait = (deps.limiter ?? sharedLimiter).take(`${userId}:${rule.bucket}`, LIMITS[rule.bucket]);
  if (wait > 0) {
    return errorResponse(429, "rate_limited", "Too many requests. Slow down.", {
      "Retry-After": String(wait),
    });
  }

  // 5. Query string: validated and rebuilt.
  const url = new URL(request.url);
  let search = "";
  if (rule.query) {
    const raw: Record<string, string> = {};
    for (const key of new Set(url.searchParams.keys())) {
      if (url.searchParams.getAll(key).length > 1) {
        return errorResponse(400, "bad_request", `Repeated query parameter: ${key.slice(0, 32)}`);
      }
      raw[key] = url.searchParams.get(key) ?? "";
    }
    const parsed = rule.query.safeParse(raw);
    if (!parsed.success) return errorResponse(400, "bad_request", "Invalid query parameters.");
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) params.set(key, value);
    }
    search = params.size ? `?${params}` : "";
  } else if (url.search) {
    return errorResponse(400, "bad_request", "This endpoint takes no query parameters.");
  }

  // 6. Body: size-capped, JSON only, validated and re-serialised.
  let body: string | undefined;
  if (method !== "GET") {
    const text = await readLimited(request, MAX_BODY_BYTES);
    if (text === null) return errorResponse(413, "payload_too_large", "Request body too large.");
    if (rule.body) {
      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().startsWith("application/json")) {
        return errorResponse(415, "unsupported_media_type", "Expected application/json.");
      }
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return errorResponse(400, "bad_request", "Malformed JSON.");
      }
      const parsed = rule.body.safeParse(json);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const where = issue?.path.join(".") || "body";
        return errorResponse(400, "bad_request", `Invalid ${where}: ${issue?.message ?? "invalid"}`);
      }
      body = JSON.stringify(parsed.data);
    } else if (text.trim() !== "" && text.trim() !== "{}") {
      return errorResponse(400, "bad_request", "This endpoint takes no body.");
    }
  }

  // 7. Upstream call, shared for reads (see ReadCache).
  const cache = deps.cache ?? sharedCache;
  const now = deps.now ?? Date.now;
  const load = () => callUpstream({ deps, method, path, search, body, timeoutMs: rule.timeoutMs, userId, audit: rule.audit === true, log });
  const snapshot = method === "GET" ? await cache.shared(`${path}${search}`, now, load) : await load();
  if (method !== "GET" && snapshot.status < 400) cache.clear();

  const bodyless = [204, 205, 304].includes(snapshot.status);
  return new Response(bodyless ? null : snapshot.body, {
    status: snapshot.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(snapshot.retryAfter ? { "Retry-After": snapshot.retryAfter } : {}),
    },
  });
}

async function callUpstream({
  deps,
  method,
  path,
  search,
  body,
  timeoutMs,
  userId,
  audit,
  log,
}: {
  deps: ProxyDeps;
  method: string;
  path: string;
  search: string;
  body: string | undefined;
  timeoutMs: number | undefined;
  userId: string;
  audit: boolean;
  log: NonNullable<ProxyDeps["log"]>;
}): Promise<Snapshot> {
  // The token is attached here and nowhere else.
  let upstream: Response;
  try {
    upstream = await (deps.fetchImpl ?? fetch)(`${deps.botUrl}/${path}${search}`, {
      method,
      headers: {
        Authorization: `Bearer ${deps.botToken}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    log({ event: "bot_call", userId, method, path, status: 503, detail: timedOut ? "timeout" : "unreachable" });
    return toSnapshot(
      timedOut
        ? errorResponse(504, "upstream_timeout", "The bot took too long to answer.")
        : errorResponse(503, "bot_unreachable", "The bot is unreachable."),
    );
  }

  if (audit || !upstream.ok) {
    log({ event: "bot_call", userId, method, path, status: upstream.status });
  }

  return toSnapshot(await normaliseUpstream(upstream));
}

async function toSnapshot(response: Response): Promise<Snapshot> {
  return {
    status: response.status,
    body: await response.text(),
    retryAfter: response.headers.get("retry-after") ?? undefined,
  };
}

async function normaliseUpstream(upstream: Response): Promise<Response> {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  const retryAfter = upstream.headers.get("retry-after");
  if (retryAfter && /^\d{1,5}$/.test(retryAfter)) headers["Retry-After"] = retryAfter;

  // A 401 from the bot means the portal's token is wrong. Surfacing it as 401
  // would make the browser think its own session ended.
  if (upstream.status === 401) {
    return errorResponse(502, "bot_auth_failed", "The portal's bot token was rejected. Check BOT_API_TOKEN.");
  }

  const text = await upstream.text().catch(() => "");
  if (text.length > MAX_RESPONSE_BYTES) {
    return errorResponse(502, "bad_upstream", "The bot sent an oversized response.");
  }

  let json: unknown = undefined;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
  }

  if (upstream.ok) {
    // Statuses that must not carry a body (a Response with one throws).
    if ([204, 205, 304].includes(upstream.status)) return new Response(null, { status: upstream.status, headers });
    if (json === undefined && text) {
      return errorResponse(502, "bad_upstream", "The bot sent a non-JSON response.");
    }
    return Response.json(json ?? null, { status: upstream.status, headers });
  }

  const shaped =
    json && typeof json === "object" && "error" in json &&
    typeof (json as { error?: { code?: unknown } }).error?.code === "string" &&
    typeof (json as { error?: { message?: unknown } }).error?.message === "string";
  if (shaped) {
    const { code, message } = (json as { error: { code: string; message: string } }).error;
    return errorResponse(upstream.status, code.slice(0, 64), message.slice(0, 500), headers);
  }
  return errorResponse(
    upstream.status >= 500 ? 502 : upstream.status,
    "internal_error",
    "The bot returned an unexpected error.",
    headers,
  );
}
