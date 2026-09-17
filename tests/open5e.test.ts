import { describe, expect, it } from "vitest";
import goblin2014 from "./fixtures/open5e-srd_goblin.json";
import lich2014 from "./fixtures/open5e-srd_lich.json";
import goblin2024 from "./fixtures/open5e-srd-2024_goblin-warrior.json";
import dragon2024 from "./fixtures/open5e-srd-2024_adult-red-dragon.json";
import { attackFromDescription, normaliseOpen5e, slugFromKey, type Open5eCreature } from "@/lib/dm/open5e";
import { statBlockSchema } from "@/lib/dm/statblock";

const load = (raw: unknown) => normaliseOpen5e(raw as Open5eCreature);

describe("normaliseOpen5e", () => {
  it("maps a simple 2024 creature", () => {
    const block = load(goblin2024);
    expect(statBlockSchema.parse(block)).toEqual(block);
    expect(block).toMatchObject({ name: "Goblin Warrior", size: "Small", cr: "1/4" });
    expect(block.abilities.dex).toBe(15);
    expect(block.actions.find((a) => a.name === "Scimitar")?.attack).toEqual({ toHit: 4, damage: "1d6+2", damageType: "Slashing" });
  });

  it("splits legendary actions and keeps only real speeds", () => {
    const block = load(dragon2024);
    expect(block.cr).toBe("17");
    expect(block.legendaryActions.map((a) => a.name)).toContain("Pounce");
    expect(block.actions.map((a) => a.name)).not.toContain("Pounce");
    expect(block.legendaryDescription).toContain("Legendary actions");
    expect(block.speed).toContain("fly 80 ft.");
    expect(block.speed).not.toContain("burrow");
    expect(block.damageImmunities.toLowerCase()).toContain("fire");
    expect(block.actions.find((a) => a.name === "Rend")?.attack).toMatchObject({
      toHit: 14,
      damage: "1d10+8",
      extraDamage: "2d4",
      extraDamageType: "Fire",
    });
  });

  it("maps 2014 creatures, taking attack numbers from the published text", () => {
    const goblin = load(goblin2014);
    expect(goblin.cr).toBe("1/4");
    // Open5e's structured data says 1d6 thunder; the SRD says 1d6 + 2 slashing.
    expect(goblin.actions.find((a) => a.name === "Scimitar")?.attack).toEqual({ toHit: 4, damage: "1d6+2", damageType: "Slashing" });
    const lich = load(lich2014);
    expect(lich.cr).toBe("21");
    expect(lich.traits.map((t) => t.name)).toContain("Spellcasting");
    expect(lich.legendaryActions.length).toBeGreaterThan(0);
  });
});

describe("slugFromKey", () => {
  it("strips the document prefix", () => {
    expect(slugFromKey("srd-2024_goblin-warrior")).toBe("goblin-warrior");
    expect(slugFromKey("srd_goblin")).toBe("goblin");
  });
});

describe("attackFromDescription", () => {
  it("reads 2014 and 2024 wording, extra damage, flat damage and negatives", () => {
    expect(attackFromDescription("Melee Weapon Attack: +7 to hit, reach 5 ft. Hit: 11 (2d6 + 4) slashing damage plus 7 (2d6) fire damage.")).toEqual({
      toHit: 7, damage: "2d6+4", damageType: "Slashing", extraDamage: "2d6", extraDamageType: "Fire",
    });
    expect(attackFromDescription("Melee Attack Roll: +4, reach 5 ft. 5 (1d6 + 2) Slashing damage.")).toEqual({ toHit: 4, damage: "1d6+2", damageType: "Slashing" });
    expect(attackFromDescription("Melee Weapon Attack: +0 to hit, reach 5 ft. Hit: 1 piercing damage.")).toEqual({ toHit: 0, damage: "1", damageType: "Piercing" });
    expect(attackFromDescription("Melee Weapon Attack: -1 to hit. Hit: 1 (1d4 - 1) bludgeoning damage.")).toEqual({ toHit: -1, damage: "1d4-1", damageType: "Bludgeoning" });
    expect(attackFromDescription("The dragon exhales fire.")).toBeUndefined();
    expect(
      attackFromDescription("Melee Attack Roll: +4, reach 5 ft. 5 (1d6 + 2) Slashing damage, plus 2 (1d4) Slashing damage if the attack roll had Advantage."),
    ).toEqual({ toHit: 4, damage: "1d6+2", damageType: "Slashing" });
  });
});
