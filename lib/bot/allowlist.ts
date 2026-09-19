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
  // Path relative to /api/v1, one literal per segment; ":index" matches an int,
  // ":session" a session id.
  path: string;
  query?: z.ZodType<Record<string, string>>;
  body?: z.ZodType<Record<string, unknown>>;
  bucket: RateBucket;
  timeoutMs?: number;
  // Written to the audit log when true.
  audit?: boolean;
  // Only users in DM_USER_IDS may call it; everyone else gets a plain 404.
  dmOnly?: boolean;
  // Bodies are capped at 8 KB unless a rule says otherwise (glossary lists).
  maxBodyBytes?: number;
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

const campaignId = z.string().regex(/^[a-f0-9]{12}$/, "invalid campaign id");
const languageCode = z.string().regex(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/, "must be a code such as tr or en");

const source = z.enum(["r2", "youtube"]);
const trackId = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[^\x00-\x1f\x7f]+$/, "invalid track id");
const layerId = z.string().regex(/^[0-9a-f]{8}$/, "invalid layer id");
const soundKind = z.enum(["ambience", "sfx"]);
const channelBody = z.object({ channel_id: snowflake }).strict();

const rules: Rule[] = [
  { method: "GET", path: "health", bucket: "read" },
  { method: "GET", path: "stats", bucket: "read" },
  {
    method: "GET",
    path: "sessions",
    bucket: "read",
    query: z
      .object({
        limit: intString(1, 200).optional(),
        campaign: z.union([campaignId, z.literal("unassigned")]).optional(),
      })
      .strict(),
  },
  { method: "GET", path: "recording", bucket: "read" },
  // Search reads every delivered transcript; the first call after a change may
  // have to index some, so it gets a longer timeout than a plain read.
  {
    method: "GET",
    path: "transcripts/search",
    bucket: "read",
    timeoutMs: 30_000,
    query: z
      .object({
        q: z.string().trim().min(1).max(200),
        campaign: z.union([campaignId, z.literal("unassigned")]).optional(),
        limit: intString(1, 100).optional(),
      })
      .strict(),
  },
  { method: "GET", path: "transcription", bucket: "read" },
  // Runs an upload pass and a download pass now; large sessions take a while.
  {
    method: "POST",
    path: "transcription/sync",
    bucket: "control",
    timeoutMs: 120_000,
    audit: true,
    dmOnly: true,
  },
  {
    method: "GET",
    path: "sessions/:session/transcript",
    bucket: "read",
    timeoutMs: 20_000,
    query: z
      .object({
        offset: z
          .string()
          .regex(/^\d{1,7}$/)
          .optional(),
        limit: intString(1, 1000).optional(),
      })
      .strict(),
  },

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
        campaign_id: campaignId.optional(),
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

  // Campaigns. Anyone signed in may read them (the session list names them);
  // changing them, or filing a session under one, belongs to the DM.
  {
    method: "GET",
    path: "campaigns",
    bucket: "read",
    query: z.object({ archived: z.literal("1").optional() }).strict(),
  },
  { method: "GET", path: "campaigns/:campaign", bucket: "read" },
  {
    method: "POST",
    path: "campaigns",
    bucket: "control",
    audit: true,
    dmOnly: true,
    body: z
      .object({
        name: z.string().trim().min(1).max(60),
        channel_id: snowflake.optional(),
        language: languageCode.optional(),
      })
      .strict(),
  },
  {
    method: "POST",
    path: "campaigns/:campaign/update",
    bucket: "control",
    audit: true,
    dmOnly: true,
    body: z
      .object({
        name: z.string().trim().min(1).max(60).optional(),
        channel_id: snowflake.nullable().optional(),
        language: languageCode.nullable().optional(),
        archived: z.boolean().optional(),
      })
      .strict()
      .refine((value) => Object.keys(value).length > 0, { message: "nothing to update" }),
  },
  {
    method: "POST",
    path: "campaigns/:campaign/terms",
    bucket: "control",
    audit: true,
    dmOnly: true,
    maxBodyBytes: 16 * 1024,
    body: z.object({ terms: z.array(z.string().trim().min(1).max(60)).max(100) }).strict(),
  },
  {
    method: "POST",
    path: "campaigns/:campaign/corrections",
    bucket: "control",
    audit: true,
    dmOnly: true,
    maxBodyBytes: 48 * 1024,
    body: z
      .object({
        corrections: z
          .array(z.object({ heard: z.string().trim().min(1).max(80), correct: z.string().trim().min(1).max(80) }).strict())
          .max(200),
      })
      .strict(),
  },
  {
    method: "POST",
    path: "sessions/:session/campaign",
    bucket: "control",
    audit: true,
    dmOnly: true,
    body: z.object({ campaign_id: campaignId.nullable() }).strict(),
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
    path: "music/seek",
    bucket: "control",
    body: z.object({ position_seconds: z.number().min(0).max(86_400) }).strict(),
  },
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

  // A roll made in the DM Screen, posted to Discord by the bot.
  {
    method: "POST",
    path: "dice/announce",
    bucket: "control",
    audit: true,
    dmOnly: true,
    body: z
      .object({
        expression: z.string().regex(/^[0-9dDkKhHlL+\-% ]{1,100}$/, "must be dice notation"),
        total: z.number().int().min(-100_000).max(100_000),
        breakdown: z.string().trim().min(1).max(300),
        label: z.string().trim().min(1).max(80).optional(),
        channel_id: snowflake.optional(),
      })
      .strict(),
  },
  { method: "POST", path: "music/leave", bucket: "control" },

  // Initiative totals players reported with /init. The DM reads and clears them.
  { method: "GET", path: "initiative", bucket: "read", dmOnly: true },
  {
    method: "POST",
    path: "initiative/clear",
    bucket: "control",
    dmOnly: true,
    body: z.object({ id: z.number().int().min(1).max(2_147_483_647).optional() }).strict(),
  },

  // Library changes and the soundboard are the DM's.
  {
    method: "POST",
    path: "music/delete",
    bucket: "control",
    audit: true,
    dmOnly: true,
    body: z.object({ id: trackId }).strict(),
  },
  { method: "GET", path: "soundboard", bucket: "read", dmOnly: true },
  {
    method: "POST",
    path: "soundboard/play",
    bucket: "control",
    timeoutMs: 30_000,
    audit: true,
    dmOnly: true,
    body: z
      .object({
        kind: soundKind,
        id: trackId,
        volume: z.number().min(0).max(2).optional(),
        channel_id: snowflake.optional(),
      })
      .strict(),
  },
  {
    method: "POST",
    path: "soundboard/stop",
    bucket: "control",
    dmOnly: true,
    body: z
      .object({ layer_id: layerId.optional(), kind: soundKind.optional() })
      .strict()
      .refine((value) => !(value.layer_id && value.kind), { message: "give layer_id or kind, not both" }),
  },
  {
    method: "POST",
    path: "soundboard/volume",
    bucket: "control",
    dmOnly: true,
    body: z.object({ layer_id: layerId, volume: z.number().min(0).max(2) }).strict(),
  },
];

const SEGMENT = /^[a-z0-9_-]{1,64}$/;
// Dated ids (2026-09-09-2130-a1b2c3d4) and the older UUIDs.
const SESSION_SEGMENT = /^[a-z0-9-]{8,64}$/;

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
      part === ":index"
        ? /^\d{1,4}$/.test(segments[i])
        : part === ":session"
          ? SESSION_SEGMENT.test(segments[i])
          : part === ":campaign"
            ? /^[a-f0-9]{12}$/.test(segments[i])
            : part === segments[i],
    );
    if (ok) return { rule, path: segments.join("/") };
  }
  return null;
}

export const allowlistForTests = rules;
