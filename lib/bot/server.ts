import "server-only";
import type { z } from "zod";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { normaliseUpstream } from "./proxy";

// Calls the portal's server makes to the bot on its own: listing the guild's
// roles for the grant editor, naming a player's character from their sheet,
// posting sheet rolls, the initiative roster, turn pings. None of these paths is
// in the browser allowlist (lib/bot/allowlist.ts), so no page can reach them;
// only server code that already decided the caller may do this calls here.
//
// Same transport rules as the proxy: token attached here only, no redirects, a
// timeout, the response size cap and error shaping of normaliseUpstream.

// The only paths this client will ever build. ":campaign" is a 12-hex id.
const SERVER_PATHS: readonly RegExp[] = [
  /^guild\/roles$/,
  /^guild\/channels$/,
  /^campaigns(\?archived=1)?$/,
  /^campaigns\/[a-f0-9]{12}\/characters(\/clear)?$/,
  /^dice\/announce$/,
  /^initiative$/,
  /^initiative\/roster(\/clear)?$/,
  /^turn\/announce$/,
];

// botUrl is BOT_API_URL as configured, which already ends in /api/v1.
export type BotServerDeps = { botUrl: string; botToken: string; fetchImpl?: typeof fetch };

export type BotServerResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; code: string; message: string };

const DEFAULT_TIMEOUT_MS = 10_000;

function defaultDeps(): BotServerDeps {
  const config = env();
  return { botUrl: config.BOT_API_URL, botToken: config.BOT_API_TOKEN };
}

export async function botServer<T>(
  method: "GET" | "POST",
  path: string,
  options: { body?: unknown; schema?: z.ZodType<T>; userId?: string; timeoutMs?: number; deps?: BotServerDeps } = {},
): Promise<BotServerResult<T>> {
  if (!SERVER_PATHS.some((pattern) => pattern.test(path))) {
    // A programming error, never user input: fail loudly in logs, closed for the caller.
    console.error(JSON.stringify({ type: "bot_server", event: "refused_path", path: path.slice(0, 80) }));
    return { ok: false, status: 500, code: "bad_path", message: "That bot call is not allowed." };
  }
  const deps = options.deps ?? defaultDeps();
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  let upstream: Response;
  try {
    upstream = await (deps.fetchImpl ?? fetch)(`${deps.botUrl}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${deps.botToken}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    audit({ event: "bot_call", userId: options.userId, method, path, status: 503, detail: timedOut ? "timeout" : "unreachable" });
    return { ok: false, status: timedOut ? 504 : 503, code: timedOut ? "upstream_timeout" : "bot_unreachable", message: "The bot could not be reached." };
  }
  if (method !== "GET" || !upstream.ok) audit({ event: "bot_call", userId: options.userId, method, path, status: upstream.status });

  const shaped = await normaliseUpstream(upstream);
  const text = await shaped.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!shaped.ok) {
    const error = (json as { error?: { code?: string; message?: string } } | null)?.error;
    return { ok: false, status: shaped.status, code: error?.code ?? "bot_error", message: error?.message ?? "The bot refused." };
  }
  if (options.schema) {
    const parsed = options.schema.safeParse(json);
    if (!parsed.success) return { ok: false, status: 502, code: "bad_upstream", message: "The bot sent an unexpected answer." };
    return { ok: true, status: shaped.status, data: parsed.data };
  }
  return { ok: true, status: shaped.status, data: json as T };
}
