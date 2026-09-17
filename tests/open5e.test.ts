import { describe, expect, it } from "vitest";
import goblin2014 from "./fixtures/open5e-srd_goblin.json";
import lich2014 from "./fixtures/open5e-srd_lich.json";
import goblin2024 from "./fixtures/open5e-srd-2024_goblin-warrior.json";
import dragon2024 from "./fixtures/open5e-srd-2024_adult-red-dragon.json";
import { normaliseOpen5e, slugFromKey, type Open5eCreature } from "@/lib/dm/open5e";
import { statBlockSchema } from "@/lib/dm/statblock";

const load = (raw: unknown) => normaliseOpen5e(raw as Open5eCreature);

describe("normaliseOpen5e", () => {
  it("maps a simple 2024 creature", () => {
    const block = load(goblin2024);
    expect(statBlockSchema.parse(block)).toEqual(block);
    expect(block).toMatchObject({ name: "Goblin Warrior", size: "Small", cr: "1/4" });
    expect(block.abilities.dex).toBe(15);
    expect(block.actions.find((a) => a.name === "Scimitar")?.attack).toMatchObject({ toHit: 4, damage: "1d6+2" });
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

  it("maps 2014 creatures", () => {
    expect(load(goblin2014).cr).toBe("1/4");
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
