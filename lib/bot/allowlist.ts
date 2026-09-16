import { z } from "zod";

// The exhaustive list of bot API calls the portal may proxy. Anything not
// matched here is refused before a request is ever built, so a client bug (or
// a hostile request) cannot reach a bot endpoint the portal does not use.
//
// Each rule validates the query string and the JSON body, and the proxy
// forwards only the re-serialised, validated values — never the raw input.

export type Method = "GET" | "POST" | "DELETE";

export type RateBucket = "read" | "control" | "recording";

export type Rule = {
  method: Method;
  // Path relative to /api/v1, one literal per segment; ":index" matches an int.
  path: string;
  query?: z.ZodType<Record<string, string>>;
  body?: z.ZodType<Record<string, unknown>>;
  bucket: RateBucket;
  timeoutMs?: number;
  // Written to the audit log when true.
  audit?: boolean;
};

const snowflake = z.string().regex(/^\d{17,20}$/, "must be a Discord id");
const sessionId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, "invalid session id");
const intString = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d{1,4}$/)
    .refine((value) => Number(value) >= min && Number(value) <= max, {
      message: `must be between ${min} and ${max}`,
    });

const source = z.enum(["r2", "youtube"]);
const channelBody = z.object({ channel_id: snowflake }).strict();

const rules: Rule[] = [
  { method: "GET", path: "health", bucket: "read" },
  { method: "GET", path: "stats", bucket: "read" },
  {
    method: "GET",
    path: "sessions",
    bucket: "read",
    query: z.object({ limit: intString(1, 200).optional() }).strict(),
  },
  { method: "GET", path: "recording", bucket: "read" },

  {
    method: "POST",
    path: "recording/start",
    bucket: "recording",
    audit: true,
    body: z
      .object({
        channel_id: snowflake,
        name: z.string().trim().min(1).max(100).optional(),
        text_channel_id: snowflake.optional(),
      })
      .strict(),
  },
  { method: "POST", path: "recording/stop", bucket: "recording", audit: true, body: channelBody },
  { method: "POST", path: "recording/cancel", bucket: "recording", audit: true, body: channelBody },
  {
    method: "POST",
    path: "recording/recover",
    bucket: "recording",
    audit: true,
    body: z.object({ session_id: sessionId }).strict(),
  },

  { method: "GET", path: "music/state", bucket: "read" },
  {
    method: "GET",
    path: "music/library",
    bucket: "read",
    query: z
      .object({
        source: source.optional(),
        q: z.string().max(200).optional(),
        limit: intString(1, 200).optional(),
      })
      .strict(),
  },
  {
    method: "POST",
    path: "music/search",
    bucket: "control",
    timeoutMs: 30_000,
    body: z.object({ source, query: z.string().trim().min(1).max(200) }).strict(),
  },
  {
    method: "POST",
    path: "music/play",
    bucket: "control",
    timeoutMs: 30_000,
    audit: true,
    body: z
      .object({
        source,
        id: z.string().min(1).max(512),
        channel_id: snowflake.optional(),
        // A queue slot, not an index: the bot accepts only these three.
        position: z.enum(["now", "next", "end"]).optional(),
      })
      .strict(),
  },
  ...(["pause", "resume", "skip", "stop"] as const).map(
    (action): Rule => ({ method: "POST", path: `music/${action}`, bucket: "control" }),
  ),
  {
    method: "POST",
    path: "music/volume",
    bucket: "control",
    body: z.object({ volume: z.number().min(0).max(2) }).strict(),
  },
  {
    method: "POST",
    path: "music/loop",
    bucket: "control",
    body: z.object({ mode: z.enum(["off", "track", "queue"]) }).strict(),
  },
  { method: "DELETE", path: "music/queue", bucket: "control" },
  { method: "DELETE", path: "music/queue/:index", bucket: "control" },
  {
    method: "POST",
    path: "music/queue/move",
    bucket: "control",
    body: z
      .object({
        from: z.number().int().min(0).max(10_000),
        to: z.number().int().min(0).max(10_000),
      })
      .strict(),
  },
  { method: "POST", path: "music/join", bucket: "control", audit: true, body: channelBody },
  { method: "POST", path: "music/leave", bucket: "control" },
];

const SEGMENT = /^[a-z0-9_-]{1,32}$/;

export type Match = { rule: Rule; path: string };

/**
 * Resolve the catch-all segments of /api/bot/[...path] to an allowlisted rule.
 * Returns null for anything unlisted, including traversal attempts, encoded
 * separators and wrong methods. The returned path is rebuilt from validated
 * segments, never copied from the request.
 */
export function matchRule(method: string, segments: readonly string[]): Match | null {
  if (segments.length === 0 || segments.length > 4) return null;
  if (!segments.every((segment) => SEGMENT.test(segment))) return null;

  for (const rule of rules) {
    if (rule.method !== method) continue;
    const pattern = rule.path.split("/");
    if (pattern.length !== segments.length) continue;

    const ok = pattern.every((part, i) =>
      part === ":index" ? /^\d{1,4}$/.test(segments[i]) : part === segments[i],
    );
    if (ok) return { rule, path: segments.join("/") };
  }
  return null;
}

export const allowlistForTests = rules;
