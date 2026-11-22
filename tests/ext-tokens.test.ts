import { describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/dm/db";
import { ExtTokenRepo } from "@/lib/ext/tokens";

const ARIA = "100000000000000002";
const BRAM = "100000000000000003";
const EMBER = "aaaaaaaaaaaa";

function repo() {
  const db = openDatabase(":memory:");
  return { db, tokens: new ExtTokenRepo(db) };
}

describe("ExtTokenRepo", () => {
  it("issues a token that verifies to its user and campaign", () => {
    const { tokens } = repo();
    const { token } = tokens.issue(ARIA, EMBER, "laptop");
    expect(token.startsWith("ptx_")).toBe(true);
    const found = tokens.verify(token);
    expect(found).toMatchObject({ userId: ARIA, campaignId: EMBER });
  });

  it("stores only a hash of the token", () => {
    const { db, tokens } = repo();
    const { token } = tokens.issue(ARIA, EMBER, "laptop");
    const rows = JSON.stringify(db.prepare("SELECT * FROM ext_tokens").all());
    expect(rows).not.toContain(token);
  });

  it("rejects unknown tokens", () => {
    const { tokens } = repo();
    expect(tokens.verify("ptx_wrong")).toBeNull();
    expect(tokens.verify("")).toBeNull();
  });

  it("stops verifying a revoked token, and only its owner can revoke it", () => {
    const { tokens } = repo();
    const { id, token } = tokens.issue(ARIA, EMBER, "laptop");
    expect(tokens.revoke(BRAM, id)).toBe(false);
    expect(tokens.verify(token)).not.toBeNull();
    expect(tokens.revoke(ARIA, id)).toBe(true);
    expect(tokens.verify(token)).toBeNull();
  });

  it("lists a user's tokens with last use, without the secret", () => {
    const { tokens } = repo();
    const { token } = tokens.issue(ARIA, EMBER, "laptop");
    tokens.issue(BRAM, EMBER, "other");
    expect(tokens.list(ARIA)[0].lastUsedAt).toBeNull();
    tokens.verify(token);
    const [info] = tokens.list(ARIA);
    expect(info).toMatchObject({ label: "laptop", campaignId: EMBER });
    expect(info.lastUsedAt).not.toBeNull();
    expect(tokens.list(ARIA)).toHaveLength(1);
    expect(JSON.stringify(info)).not.toContain(token);
  });

  it("allows at most five tokens per user", () => {
    const { tokens } = repo();
    for (let i = 0; i < 5; i++) tokens.issue(ARIA, EMBER, `t${i}`);
    expect(() => tokens.issue(ARIA, EMBER, "sixth")).toThrow();
    expect(() => tokens.issue(BRAM, EMBER, "mine")).not.toThrow();
  });
});
