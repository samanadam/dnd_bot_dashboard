import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "@/lib/vault/auren.json";
import tr from "@/lib/vault/auren.tr.json";
import { isVaultPath } from "@/lib/vault/base";

describe("vault", () => {
  it("only /vault and below is public", () => {
    expect(isVaultPath("/vault")).toBe(true);
    expect(isVaultPath("/vault/auren")).toBe(true);
    expect(isVaultPath("/vaulted")).toBe(false);
    expect(isVaultPath("/dm/vault")).toBe(false);
  });

  it.each([["en", en], ["tr", tr]])("%s: links resolve, hidden notes stay out, every image exists", (_lang, data) => {
    const ids = new Set(data.notes.map((n) => n.id));
    expect(ids.has(data.hub)).toBe(true);
    expect(data.notes.map((n) => n.id).sort()).toEqual(en.notes.map((n) => n.id).sort());
    for (const n of data.notes) for (const t of n.links) expect(ids.has(t), `${n.id} -> ${t}`).toBe(true);
    expect(ids.has("gaps")).toBe(false);
    expect(ids.has("character-bible-v4")).toBe(false);
    expect(JSON.stringify(data)).not.toMatch(/Gaps|Character Bible/);
    for (const m of JSON.stringify(data).matchAll(/"(?:src|thumb)":"([^"]+)"/g)) {
      expect(existsSync(`public/vault/img/${m[1]}.webp`), m[1]).toBe(true);
    }
  });
});
