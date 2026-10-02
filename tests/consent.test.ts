import { describe, expect, it } from "vitest";
import { CONSENT_VERSION, parseConsent, serializeConsent } from "@/lib/consent";
import { legalInfo } from "@/lib/legal";

describe("consent record", () => {
  it("round-trips through the cookie value", () => {
    const consent = { v: CONSENT_VERSION, preferences: true, at: 1_700_000_000_000 };
    expect(parseConsent(serializeConsent(consent))).toEqual(consent);
    expect(parseConsent(serializeConsent({ ...consent, preferences: false }))?.preferences).toBe(false);
  });

  it("treats a missing, malformed or outdated record as no decision", () => {
    expect(parseConsent(undefined)).toBeNull();
    expect(parseConsent("")).toBeNull();
    expect(parseConsent("not-json")).toBeNull();
    expect(parseConsent(encodeURIComponent('{"v":1,"preferences":"yes","at":1}'))).toBeNull();
    expect(parseConsent(serializeConsent({ v: CONSENT_VERSION - 1, preferences: true, at: 1 }))).toBeNull();
  });
});

describe("legal info", () => {
  it("falls back to neutral wording when nothing is configured", () => {
    const info = legalInfo();
    expect(info.operator).toBeTruthy();
    expect(info.email === null || info.email.includes("@")).toBe(true);
  });
});
