import { describe, expect, it, vi } from "vitest";
import {
  checkDiscordAccess,
  MAX_UNVERIFIED_MS,
  RECHECK_INTERVAL_MS,
  reverify,
} from "@/lib/discordAccess";
import { RateLimiter } from "@/lib/rateLimit";

const GUILD = "111111111111111111";
const ADMIN = "222222222222222222";

const run = (response: Response | Error) =>
  checkDiscordAccess({
    accessToken: "t",
    guildId: GUILD,
    roleIds: [ADMIN],
    fetchImpl: vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    }),
  });

describe("checkDiscordAccess", () => {
  it("allows a member holding an allowed role", async () => {
    expect(await run(Response.json({ roles: ["9", ADMIN] }))).toEqual({ kind: "allowed" });
  });

  it("denies a member without the role", async () => {
    expect(await run(Response.json({ roles: ["9"] }))).toEqual({ kind: "denied", reason: "missing_role" });
  });

  it("denies non-members and revoked tokens", async () => {
    expect((await run(new Response(null, { status: 404 }))).kind).toBe("denied");
    expect((await run(new Response(null, { status: 401 }))).kind).toBe("denied");
  });

  it("treats outages and odd payloads as unknown, not allowed", async () => {
    expect((await run(new Response(null, { status: 500 }))).kind).toBe("unknown");
    expect((await run(new Response(null, { status: 429 }))).kind).toBe("unknown");
    expect((await run(new TypeError("down"))).kind).toBe("unknown");
    expect((await run(Response.json({ nope: true }))).kind).toBe("unknown");
  });
});

describe("reverify", () => {
  const allowed = async () => ({ kind: "allowed" as const });
  const denied = async () => ({ kind: "denied" as const, reason: "missing_role" as const });
  const unknown = async () => ({ kind: "unknown" as const });

  it("skips the check inside the interval", async () => {
    const check = vi.fn(denied);
    expect(await reverify({ verifiedAt: 1000 }, 1000 + RECHECK_INTERVAL_MS - 1, check)).toBe(1000);
    expect(check).not.toHaveBeenCalled();
  });

  it("refreshes on allowed and ends the session on denied", async () => {
    const now = RECHECK_INTERVAL_MS + 5000;
    expect(await reverify({ verifiedAt: 0 }, now, allowed)).toBe(now);
    expect(await reverify({ verifiedAt: 0 }, now, denied)).toBeNull();
  });

  it("tolerates a short Discord outage, then fails closed", async () => {
    expect(await reverify({ verifiedAt: 0 }, RECHECK_INTERVAL_MS + 1, unknown)).toBe(0);
    expect(await reverify({ verifiedAt: 0 }, MAX_UNVERIFIED_MS + 1, unknown)).toBeNull();
  });
});

describe("RateLimiter", () => {
  it("resets after the window", () => {
    let now = 0;
    const limiter = new RateLimiter(() => now);
    const limit = { max: 2, windowMs: 1000 };
    expect(limiter.take("k", limit)).toBe(0);
    expect(limiter.take("k", limit)).toBe(0);
    expect(limiter.take("k", limit)).toBe(1);
    expect(limiter.take("other", limit)).toBe(0);
    now = 1000;
    expect(limiter.take("k", limit)).toBe(0);
  });
});
