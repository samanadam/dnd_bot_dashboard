import { describe, expect, it } from "vitest";
import {
  abilityModifier, crToNumber, formatModifier, initiativeBonus, proficiencyForCr, statBlockSchema,
} from "@/lib/dm/statblock";
import { goblin } from "./fixtures/goblin";

describe("statBlockSchema", () => {
  it("accepts a complete stat block", () => {
    expect(statBlockSchema.parse(goblin)).toEqual(goblin);
  });

  it("rejects unknown fields, bad CR, out-of-range numbers and non-dice damage", () => {
    expect(statBlockSchema.safeParse({ ...goblin, evil: true }).success).toBe(false);
    expect(statBlockSchema.safeParse({ ...goblin, cr: "31" }).success).toBe(false);
    expect(statBlockSchema.safeParse({ ...goblin, ac: 99 }).success).toBe(false);
    expect(statBlockSchema.safeParse({ ...goblin, abilities: { ...goblin.abilities, str: 0 } }).success).toBe(false);
    const badAttack = { ...goblin, actions: [{ name: "x", desc: "", attack: { toHit: 1, damage: "<img>" } }] };
    expect(statBlockSchema.safeParse(badAttack).success).toBe(false);
    expect(statBlockSchema.safeParse({ ...goblin, saves: { luck: 3 } }).success).toBe(false);
  });

  it("caps list and text sizes", () => {
    const many = Array.from({ length: 41 }, () => ({ name: "a", desc: "b" }));
    expect(statBlockSchema.safeParse({ ...goblin, traits: many }).success).toBe(false);
    expect(statBlockSchema.safeParse({ ...goblin, name: "x".repeat(121) }).success).toBe(false);
  });
});

describe("helpers", () => {
  it("computes modifiers, CR and proficiency", () => {
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(15)).toBe(2);
    expect(formatModifier(0)).toBe("+0");
    expect(formatModifier(-2)).toBe("-2");
    expect(crToNumber("1/8")).toBe(0.125);
    expect(crToNumber("17")).toBe(17);
    expect(proficiencyForCr("1/4")).toBe(2);
    expect(proficiencyForCr("5")).toBe(3);
    expect(proficiencyForCr("17")).toBe(6);
    expect(proficiencyForCr("30")).toBe(9);
    expect(initiativeBonus({ ...goblin, initiativeBonus: undefined })).toBe(2);
  });
});
