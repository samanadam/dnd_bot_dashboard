import "server-only";
import { z } from "zod";

// Server-only configuration. Nothing here may ever be prefixed NEXT_PUBLIC_,
// which would inline the value into client JavaScript.

const snowflake = z.string().regex(/^\d{17,20}$/, "must be a Discord id");

const schema = z.object({
  BOT_API_URL: z
    .string()
    .url()
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "must be an http(s) URL")
    .transform((value) => value.replace(/\/+$/, "")),
  // Opt-in, comma-separated container hostnames the portal may reach over plain
  // HTTP on a private Docker network (e.g. "bot"). Single-label names only, so
  // a public hostname can never be listed here.
  BOT_API_HTTP_HOSTS: z
    .string()
    .optional()
    .transform((value) =>
      (value ?? "")
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,62}$/, "must be single-label container names"))),
  BOT_API_TOKEN: z.string().min(16, "looks too short to be a real token"),
  AUTH_SECRET: z.string().min(32, "generate with `npx auth secret`"),
  AUTH_DISCORD_ID: z.string().min(1),
  AUTH_DISCORD_SECRET: z.string().min(1),
  ALLOWED_GUILD_ID: snowflake,
  // Comma-separated: holding any one of these roles grants access.
  ALLOWED_ROLE_IDS: z
    .string()
    .transform((value) =>
      value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    )
    .pipe(z.array(snowflake).min(1, "at least one role id is required")),
});

const LOOPBACK = ["127.0.0.1", "localhost", "[::1]"];

// Plain HTTP would send the all-powerful bot token in clear text, so it is only
// allowed where traffic never leaves the machine: loopback, or a container
// hostname the operator explicitly listed.
const validated = schema.superRefine((config, ctx) => {
  const url = new URL(config.BOT_API_URL);
  if (url.protocol === "https:") return;
  if (LOOPBACK.includes(url.hostname) || config.BOT_API_HTTP_HOSTS.includes(url.hostname.toLowerCase())) return;
  ctx.addIssue({
    code: "custom",
    path: ["BOT_API_URL"],
    message: "must be https, or http on loopback or a host listed in BOT_API_HTTP_HOSTS",
  });
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = validated.safeParse({
    ...process.env,
    // Accept the plan's names as aliases.
    AUTH_DISCORD_ID: process.env.AUTH_DISCORD_ID ?? process.env.DISCORD_CLIENT_ID,
    AUTH_DISCORD_SECRET:
      process.env.AUTH_DISCORD_SECRET ?? process.env.DISCORD_CLIENT_SECRET,
    ALLOWED_ROLE_IDS: process.env.ALLOWED_ROLE_IDS ?? process.env.ALLOWED_ROLE_ID,
  });
  if (!parsed.success) {
    // Report which variables are wrong, never their values.
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid server configuration: ${problems}`);
  }
  cached = parsed.data;
  return cached;
}
