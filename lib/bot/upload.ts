import type { ProxyDeps } from "./proxy";
import { clearReadCache, normaliseUpstream } from "./proxy";
import { RateLimiter, type Limit } from "../rateLimit";
import { errorResponse, isSameOrigin, PORTAL_HEADER } from "../requestGuard";

// POST /api/bot/music/upload?folder=&filename= — the one bot call whose body is
// a file rather than a few JSON fields. It cannot go through the JSON proxy,
// so it repeats that pipeline here with its own limits, and streams the bytes
// to the bot without buffering them. The bot checks the file itself again
// (magic bytes, ffprobe, no overwrite); these checks keep junk off its disk.

export const UPLOAD_MAX_BYTES = 150 * 1_000_000;
export const UPLOAD_LIMIT: Limit = { max: 6, windowMs: 60_000 };
export const UPLOAD_TIMEOUT_MS = 10 * 60_000;
export const UPLOAD_FOLDERS = ["music", "ambience", "sfx"] as const;
export const AUDIO_EXTENSIONS = [".mp3", ".ogg", ".opus", ".flac", ".wav", ".m4a", ".aac"] as const;

const sharedLimiter = new RateLimiter();

export function isUploadPath(method: string, segments: readonly string[]) {
  return method === "POST" && segments.length === 2 && segments[0] === "music" && segments[1] === "upload";
}

export function validFilename(name: string): boolean {
  if (name.length < 5 || name.length > 200) return false;
  // No control characters anywhere; the bot rebuilds the name either way.
  if ([...name].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return false;
  const lower = name.toLowerCase();
  return AUDIO_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export async function handleBotUpload(request: Request, deps: ProxyDeps): Promise<Response> {
  const log = deps.log ?? (() => {});
  const path = "music/upload";

  const userId = await deps.getUserId();
  if (!userId) return errorResponse(401, "unauthorized", "Sign in required.");

  if (request.headers.get(PORTAL_HEADER) !== "1" || !isSameOrigin(request)) {
    log({ event: "bot_refused", userId, method: "POST", path, status: 403, detail: "cross_origin" });
    return errorResponse(403, "forbidden", "Cross-origin request refused.");
  }
  if (!deps.isDm?.(userId)) {
    log({ event: "bot_refused", userId, method: "POST", path, status: 404, detail: "dm_only" });
    return errorResponse(404, "not_found", "Unknown endpoint.");
  }

  const wait = (deps.limiter ?? sharedLimiter).take(`${userId}:upload`, UPLOAD_LIMIT);
  if (wait > 0) {
    return errorResponse(429, "rate_limited", "Too many uploads. Slow down.", { "Retry-After": String(wait) });
  }

  const url = new URL(request.url);
  const keys = [...url.searchParams.keys()];
  const folder = url.searchParams.get("folder") ?? "";
  const filename = url.searchParams.get("filename") ?? "";
  if (
    keys.length !== 2 ||
    url.searchParams.getAll("folder").length !== 1 ||
    url.searchParams.getAll("filename").length !== 1 ||
    !(UPLOAD_FOLDERS as readonly string[]).includes(folder)
  ) {
    return errorResponse(400, "bad_request", "Give exactly one folder (music, ambience or sfx) and one filename.");
  }
  if (!validFilename(filename)) {
    return errorResponse(415, "unsupported_format", `Upload an audio file (${AUDIO_EXTENSIONS.join(", ")}).`);
  }

  const lengthHeader = request.headers.get("content-length");
  if (!lengthHeader || !/^\d{1,10}$/.test(lengthHeader)) {
    return errorResponse(411, "length_required", "The upload needs a Content-Length.");
  }
  const length = Number(lengthHeader);
  if (length === 0 || !request.body) return errorResponse(400, "empty_file", "The file is empty.");
  if (length > UPLOAD_MAX_BYTES) {
    return errorResponse(413, "payload_too_large", `Files can be at most ${UPLOAD_MAX_BYTES / 1_000_000} MB.`);
  }

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!(contentType.startsWith("audio/") || contentType === "application/octet-stream")) {
    return errorResponse(415, "unsupported_media_type", "Send the file as audio bytes.");
  }

  // Counts what actually arrives: a body longer than it claimed is cut off.
  let seen = 0;
  const guarded = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > length) {
          controller.error(new Error("body longer than Content-Length"));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );

  const search = new URLSearchParams({ folder, filename });
  let upstream: Response;
  try {
    upstream = await (deps.fetchImpl ?? fetch)(`${deps.botUrl}/${path}?${search}`, {
      method: "POST",
      headers: {
        // The token is attached here and in proxy.ts, nowhere else.
        Authorization: `Bearer ${deps.botToken}`,
        Accept: "application/json",
        "Content-Type": "application/octet-stream",
        "Content-Length": String(length),
      },
      body: guarded,
      // Required by Node's fetch for a streamed request body.
      duplex: "half",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    } as RequestInit & { duplex: "half" });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    log({ event: "bot_call", userId, method: "POST", path, status: 503, detail: timedOut ? "timeout" : "unreachable" });
    return timedOut
      ? errorResponse(504, "upstream_timeout", "The upload took too long.")
      : errorResponse(503, "bot_unreachable", "The upload did not reach the bot.");
  }

  log({ event: "bot_call", userId, method: "POST", path, status: upstream.status, detail: folder });
  // The library and soundboard listings just changed for everyone.
  if (upstream.ok) clearReadCache(deps.cache);
  return normaliseUpstream(upstream);
}
