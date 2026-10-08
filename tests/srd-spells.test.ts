import { describe, expect, it } from "vitest";
import { featBlockSchema } from "@/lib/dm/feats";
import { spellBlockSchema } from "@/lib/dm/spells";
import { getSrdFeat, getSrdSpell, listSrdFeats, listSrdSpells } from "@/lib/dm/srdSpells";

describe("bundled SRD spells and feats", () => {
  it("holds both editions, each entry valid and each slug unique", () => {
    const spells = listSrdSpells();
    for (const edition of ["2014", "2024"] as const) {
      const mine = spells.filter((s) => s.edition === edition);
      expect(new Set(mine.map((s) => s.slug)).size).toBe(mine.length);
      for (const { slug } of mine) expect(spellBlockSchema.safeParse(getSrdSpell(edition, slug)).success, slug).toBe(true);
    }
    expect(Math.abs(spells.filter((s) => s.edition === "2014").length - 319)).toBeLessThanOrEqual(10);
    expect(Math.abs(spells.filter((s) => s.edition === "2024").length - 339)).toBeLessThanOrEqual(10);

    const feats = listSrdFeats();
    expect(feats.filter((f) => f.edition === "2024").length).toBeGreaterThanOrEqual(15);
    for (const f of feats) expect(featBlockSchema.safeParse(getSrdFeat(f.edition, f.slug)).success, f.slug).toBe(true);
  });

  it("looks spells up by edition and refuses odd slugs", () => {
    expect(getSrdSpell("2024", "fireball")?.level).toBe(3);
    expect(getSrdSpell("2014", "fireball")?.effect?.roll).toBe("8d6");
    expect(getSrdSpell("2024", "../srd-2024")).toBeNull();
    expect(getSrdSpell("2024", "no-such-spell")).toBeNull();
    expect(getSrdFeat("2024", "alert")?.category).toBe("Origin");
  });
});
