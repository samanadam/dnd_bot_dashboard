import { describe, expect, it } from "vitest";
import { characterIdFromPath, needsCheck, nextBackoff, portalOrigin, shouldPush, signature } from "@/extension/src/state";

describe("extension state helpers", () => {
  it("pushes only when the character changed", () => {
    expect(shouldPush(null, "a")).toBe(true);
    expect(shouldPush("a", "a")).toBe(false);
    expect(shouldPush("a", "b")).toBe(true);
  });

  it("backs off from 15 seconds, doubling, up to 5 minutes", () => {
    expect(nextBackoff(0)).toBe(15_000);
    expect(nextBackoff(1)).toBe(30_000);
    expect(nextBackoff(3)).toBe(120_000);
    expect(nextBackoff(10)).toBe(300_000);
  });

  it("signs the same data the same way and different data differently", () => {
    expect(signature('{"a":1}')).toBe(signature('{"a":1}'));
    expect(signature('{"a":1}')).not.toBe(signature('{"a":2}'));
  });

  it("reads the character id from a D&D Beyond character path", () => {
    expect(characterIdFromPath("/characters/150752285")).toBe("150752285");
    expect(characterIdFromPath("/characters/150752285/builder")).toBe("150752285");
    expect(characterIdFromPath("/characters/builder")).toBeNull();
    expect(characterIdFromPath("/profile")).toBeNull();
  });

  it("re-checks the pairing every five minutes, even when nothing changed", () => {
    expect(needsCheck(null, 1_000)).toBe(true);
    expect(needsCheck(1_000, 1_000 + 299_999)).toBe(false);
    expect(needsCheck(1_000, 1_000 + 300_000)).toBe(true);
  });

  it("accepts https portals and localhost, and nothing else", () => {
    expect(portalOrigin("https://portal.example.com/settings")).toBe("https://portal.example.com");
    expect(portalOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(portalOrigin("http://portal.example.com")).toBeNull();
    expect(portalOrigin("javascript:alert(1)")).toBeNull();
    expect(portalOrigin("not a url")).toBeNull();
  });
});
