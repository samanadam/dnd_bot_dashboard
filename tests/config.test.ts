import { afterEach, describe, expect, it, vi } from "vitest";
import { safeCallbackUrl } from "@/lib/callbackUrl";

describe("safeCallbackUrl", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeCallbackUrl("/bot/music")).toBe("/bot/music");
    expect(safeCallbackUrl("/bot/sessions?x=1")).toBe("/bot/sessions?x=1");
  });

  it("refuses anything that could leave the origin or loop", () => {
    for (const value of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "javascript:alert(1)",
      "/api/bot/stats",
      "/signin",
      "bot",
      undefined,
      ["/bot"],
      "/" + "a".repeat(300),
    ]) {
      expect(safeCallbackUrl(value)).toBe("/");
    }
  });
});

const valid = {
  BOT_API_URL: "https://bot.example/api/v1/",
  BOT_API_TOKEN: "x".repeat(32),
  AUTH_SECRET: "y".repeat(32),
  AUTH_DISCORD_ID: "123",
  AUTH_DISCORD_SECRET: "secret",
  ALLOWED_GUILD_ID: "111111111111111111",
  ALLOWED_ROLE_IDS: "222222222222222222, 333333333333333333",
};

async function loadEnv(overrides: Record<string, string> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries({ ...valid, ...overrides })) vi.stubEnv(key, value);
  const { env } = await import("@/lib/env");
  return env;
}

describe("env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses a valid configuration", async () => {
    const config = (await loadEnv())();
    expect(config.BOT_API_URL).toBe("https://bot.example/api/v1");
    expect(config.ALLOWED_ROLE_IDS).toEqual(["222222222222222222", "333333333333333333"]);
  });

  it("allows plain http only on loopback", async () => {
    expect((await loadEnv({ BOT_API_URL: "http://127.0.0.1:8080/api/v1" }))().BOT_API_URL).toContain("127.0.0.1");
    const remote = await loadEnv({ BOT_API_URL: "http://bot.example/api/v1" });
    expect(() => remote()).toThrow(/BOT_API_URL/);
  });

  it("allows plain http to a container only when explicitly listed", async () => {
    const unlisted = await loadEnv({ BOT_API_URL: "http://bot:8080/api/v1" });
    expect(() => unlisted()).toThrow(/BOT_API_URL/);
    expect((await loadEnv({ BOT_API_URL: "http://bot:8080/api/v1", BOT_API_HTTP_HOSTS: "bot" }))().BOT_API_URL).toBe("http://bot:8080/api/v1");
    // A public hostname cannot be allowlisted for plain HTTP.
    const dotted = await loadEnv({ BOT_API_URL: "http://bot.example/api/v1", BOT_API_HTTP_HOSTS: "bot.example" });
    expect(() => dotted()).toThrow(/BOT_API_HTTP_HOSTS/);
    const ftp = await loadEnv({ BOT_API_URL: "ftp://127.0.0.1/api/v1" });
    expect(() => ftp()).toThrow(/BOT_API_URL/);
  });

  it("refuses weak secrets and bad role ids without echoing values", async () => {
    const env = await loadEnv({ AUTH_SECRET: "short-secret", ALLOWED_ROLE_IDS: "admin" });
    let message = "";
    try {
      env();
    } catch (error) {
      message = String(error);
    }
    expect(message).toMatch(/AUTH_SECRET/);
    expect(message).toMatch(/ALLOWED_ROLE_IDS/);
    expect(message).not.toContain("short-secret");
    expect(message).not.toContain(valid.BOT_API_TOKEN);
  });
});

describe("themes", () => {
  it("only accepts known theme ids from the cookie", async () => {
    const { parseTheme, DEFAULT_THEME } = await import("@/lib/theme");
    expect(parseTheme("ember")).toBe("ember");
    for (const value of [undefined, "", "EMBER", "arcane;background:url(x)", "__proto__", "constructor"]) {
      expect(parseTheme(value)).toBe(DEFAULT_THEME);
    }
  });

  it("emits only hex or rgb token values", async () => {
    const { THEMES, themeVars } = await import("@/lib/theme");
    expect(new Set(THEMES.map((theme) => theme.id)).size).toBe(THEMES.length);
    for (const theme of THEMES) {
      for (const [key, value] of Object.entries(themeVars(theme.id))) {
        if (key === "colorScheme") expect(["dark", "light"]).toContain(value);
        else if (key === "--shadow") expect(value).toMatch(/^[\d a-z().,/-]+$/);
        else expect(value).toMatch(/^(#[0-9a-f]{6}|rgb\(\d+ \d+ \d+ \/ [\d.]+\))$/);
      }
    }
  });
});
