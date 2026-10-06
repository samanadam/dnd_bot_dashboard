import { describe, expect, it } from "vitest";
import { newBody, sheetBodySchema, type ClassEntry, type SheetBody } from "@/lib/sheets/body";
import { derive, scaledRoll, slotsFor } from "@/lib/sheets/derive";
import { pactSlots, proficiencyBonus } from "@/lib/sheets/rules";
import { newVitals, type Vitals } from "@/lib/sheets/vitals";

const cls = (name: string, level: number, over: Partial<ClassEntry> = {}): ClassEntry => {
  const table: Record<string, Partial<ClassEntry>> = {
    Fighter: { hitDie: 10, caster: "none", spellAbility: null, saveProficiencies: ["str", "con"] },
    Wizard: { hitDie: 6, caster: "full", spellAbility: "int", saveProficiencies: ["int", "wis"] },
    Paladin: { hitDie: 10, caster: "half", spellAbility: "cha", saveProficiencies: ["wis", "cha"] },
    Ranger: { hitDie: 10, caster: "half", spellAbility: "wis", saveProficiencies: ["str", "dex"] },
    Sorcerer: { hitDie: 6, caster: "full", spellAbility: "cha", saveProficiencies: ["con", "cha"] },
    Warlock: { hitDie: 8, caster: "pact", spellAbility: "cha", saveProficiencies: ["wis", "cha"] },
    Bard: { hitDie: 8, caster: "full", spellAbility: "cha", saveProficiencies: ["dex", "cha"] },
    Monk: { hitDie: 8, caster: "none", spellAbility: null, saveProficiencies: ["str", "dex"] },
  };
  return { id: `${name.toLowerCase()}${level}`, name, subclass: "", level, preparedMax: null, ...table[name], ...over } as ClassEntry;
};

function sheet(over: (body: SheetBody) => void = () => {}): SheetBody {
  const body = newBody("Aria");
  over(body);
  return sheetBodySchema.parse(body);
}

const scores = (body: SheetBody, values: Partial<Record<keyof SheetBody["abilities"], number>>) => {
  for (const [ability, score] of Object.entries(values)) body.abilities[ability as keyof SheetBody["abilities"]].base = score;
};

const vitals = (over: Partial<Vitals> = {}): Vitals => ({ ...newVitals(10), ...over });

describe("the basics", () => {
  it("has the proficiency bonus of the books at every level", () => {
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(proficiencyBonus)).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  });

  it("works out modifiers, saves from the first class only, and skills with expertise", () => {
    const body = sheet((b) => {
      scores(b, { str: 8, dex: 16, int: 13, wis: 12 });
      b.classes = [cls("Fighter", 3), cls("Wizard", 2)];
      b.proficiencies.skills.stealth = "expertise";
      b.proficiencies.skills.perception = "proficient";
    });
    const d = derive(body, vitals(), "2014");
    expect(d.totalLevel).toBe(5);
    expect(d.proficiency).toBe(3);
    expect(d.abilities.str.mod).toBe(-1);
    // Multiclassing never adds saving throws: Fighter's, not Wizard's.
    expect(d.saves.str).toMatchObject({ bonus: 2, proficient: true });
    expect(d.saves.int).toMatchObject({ bonus: 1, proficient: false });
    expect(d.skills.stealth.bonus).toBe(3 + 6);
    expect(d.skills.stealth.why).toBe("Dexterity +3, expertise +6");
    expect(d.passive.perception).toBe(10 + 1 + 3);
  });

  it("gives Jack of All Trades half proficiency on untrained checks and initiative", () => {
    const body = sheet((b) => {
      b.classes = [cls("Bard", 2)];
      b.proficiencies.jackOfAllTrades = true;
      b.proficiencies.skills.persuasion = "proficient";
    });
    const d = derive(body, vitals(), "2024");
    expect(d.skills.arcana.bonus).toBe(1);
    expect(d.skills.persuasion.bonus).toBe(2);
    expect(d.initiative.bonus).toBe(1);
  });
});

describe("armor class and hit points", () => {
  it("handles each AC mode", () => {
    const monk = sheet((b) => {
      scores(b, { dex: 16, wis: 14 });
      b.combat.ac = { mode: "unarmored", extra: "wis", bonus: 0 };
    });
    expect(derive(monk, vitals(), "2014").ac.value).toBe(15);
    const knight = sheet((b) => {
      scores(b, { dex: 16 });
      b.combat.ac = { mode: "armor", base: 14, dexCap: 2, shield: true, bonus: 1 };
    });
    expect(derive(knight, vitals(), "2014").ac).toEqual({ value: 19, why: "armor 14, Dexterity +2, shield +2, bonus +1" });
    const fixed = sheet((b) => {
      b.combat.ac = { mode: "manual", value: 21 };
    });
    expect(derive(fixed, vitals(), "2014").ac.value).toBe(21);
  });

  it("takes the first hit die in full, then the average, for every class", () => {
    const fighter = sheet((b) => {
      scores(b, { con: 14 });
      b.classes = [cls("Fighter", 3)];
    });
    expect(derive(fighter, vitals(), "2014").maxHp).toBe(10 + 2 + 2 * (6 + 2));
    const mixed = sheet((b) => {
      scores(b, { con: 12 });
      b.classes = [cls("Fighter", 1), cls("Wizard", 2)];
      b.combat.hp = { mode: "average", bonusPerLevel: 1, bonus: 2 };
    });
    expect(derive(mixed, vitals(), "2014").maxHp).toBe(10 + 1 + 1 + 2 * (4 + 1 + 1) + 2);
    expect(derive(mixed, vitals({ maxHpAdjust: -5 }), "2014").maxHp).toBe(21);
  });

  it("pools hit dice by size", () => {
    const body = sheet((b) => {
      b.classes = [cls("Fighter", 3), cls("Paladin", 2), cls("Wizard", 1)];
    });
    const d = derive(body, vitals({ hitDiceSpent: { 6: 0, 8: 0, 10: 2, 12: 0 } }), "2014");
    expect(d.hitDice).toEqual([
      { die: 10, total: 5, left: 3 },
      { die: 6, total: 1, left: 1 },
    ]);
  });
});

describe("spell slots", () => {
  const slots = (edition: "2014" | "2024", classes: ClassEntry[]) => slotsFor(edition, classes).filter((n) => n > 0);

  it("follows each edition for a lone half caster", () => {
    expect(slots("2014", [cls("Paladin", 1)])).toEqual([]);
    expect(slots("2024", [cls("Paladin", 1)])).toEqual([2]);
    expect(slots("2014", [cls("Paladin", 2)])).toEqual([2]);
    expect(slots("2014", [cls("Paladin", 5)])).toEqual([4, 2]);
  });

  it("rounds half casters down in 2014 and up in 2024 when multiclassing", () => {
    expect(slots("2014", [cls("Ranger", 5), cls("Wizard", 3)])).toEqual([4, 3, 2]);
    expect(slots("2024", [cls("Ranger", 5), cls("Wizard", 3)])).toEqual([4, 3, 3]);
    expect(slots("2014", [cls("Paladin", 3), cls("Sorcerer", 3)])).toEqual([4, 3]);
    expect(slots("2024", [cls("Paladin", 3), cls("Sorcerer", 3)])).toEqual([4, 3, 2]);
  });

  it("handles a third caster and a full caster at 20", () => {
    const knight = cls("Fighter", 7, { caster: "third", spellAbility: "int" });
    expect(slots("2014", [knight])).toEqual([4, 2]);
    expect(slots("2014", [cls("Fighter", 2, { caster: "third", spellAbility: "int" })])).toEqual([]);
    expect(slots("2024", [cls("Wizard", 20)])).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
  });

  it("keeps Pact Magic apart from the other slots", () => {
    const body = sheet((b) => {
      b.classes = [cls("Warlock", 5), cls("Sorcerer", 2)];
      b.spellcasting.extraSlots = [1, 0, 0, 0, 0, 0, 0, 0, 0];
    });
    const d = derive(body, vitals({ pactSpent: 1, slotsSpent: [2, 0, 0, 0, 0, 0, 0, 0, 0] }), "2014");
    expect(d.slots.slice(0, 2)).toEqual([4, 0]);
    expect(d.slotsLeft[0]).toBe(2);
    expect(d.pact).toEqual({ count: 2, level: 3, left: 1 });
    expect([1, 2, 3, 9, 11, 17].map((level) => pactSlots(level))).toEqual([
      { count: 1, level: 1 },
      { count: 2, level: 1 },
      { count: 2, level: 2 },
      { count: 2, level: 5 },
      { count: 3, level: 5 },
      { count: 4, level: 5 },
    ]);
  });

  it("works out save DC, attack and how many spells a class prepares", () => {
    const wizard = sheet((b) => {
      scores(b, { int: 16 });
      b.classes = [cls("Wizard", 5)];
    });
    expect(derive(wizard, vitals(), "2014").casting[0]).toMatchObject({ dc: 14, attack: 6, preparedMax: 8 });
    expect(derive(wizard, vitals(), "2024").casting[0].preparedMax).toBe(9);
    const sorcerer = sheet((b) => {
      b.classes = [cls("Sorcerer", 3)];
    });
    expect(derive(sorcerer, vitals(), "2014").casting[0].preparedMax).toBeNull();
    const fixed = sheet((b) => {
      b.classes = [cls("Wizard", 5, { preparedMax: 12 })];
    });
    expect(derive(fixed, vitals(), "2014").casting[0].preparedMax).toBe(12);
  });

  it("grows cantrips with the character and levelled spells with the slot", () => {
    const bolt = { level: 0, effect: { roll: "1d10" }, scaling: { by: "character" as const, steps: [{ at: 5, roll: "2d10" }, { at: 11, roll: "3d10" }, { at: 17, roll: "4d10" }] } };
    expect([4, 5, 11, 17].map((level) => scaledRoll(bolt, 0, level))).toEqual(["1d10", "2d10", "3d10", "4d10"]);
    const arrow = { level: 2, effect: { roll: "4d4" }, scaling: { by: "slot" as const, steps: [{ at: 3, roll: "5d4" }, { at: 4, roll: "6d4" }] } };
    expect([2, 3, 4].map((slot) => scaledRoll(arrow, slot, 9))).toEqual(["4d4", "5d4", "6d4"]);
    expect(scaledRoll({ level: 1, effect: null, scaling: null }, 1, 1)).toBeNull();
  });
});

describe("attacks, resources, load and exhaustion", () => {
  it("adds the right ability and proficiency to attacks", () => {
    const body = sheet((b) => {
      scores(b, { str: 16, dex: 14, int: 18 });
      b.classes = [cls("Fighter", 5)];
      b.combat.attacks = [
        { id: "a", name: "Rapier", ability: "best-str-dex", proficient: true, toHitBonus: 1, damage: [{ roll: "1d8", type: "piercing", addAbility: true }], range: "", properties: "", notes: "", itemId: null },
        { id: "b", name: "Unarmed", ability: "none", proficient: false, toHitBonus: 0, damage: [{ roll: "1", type: "bludgeoning", addAbility: true }], range: "", properties: "", notes: "", itemId: null },
      ];
    });
    expect(derive(body, vitals(), "2014").attacks).toEqual([
      { id: "a", toHit: 3 + 3 + 1, damage: ["1d8+3 piercing"] },
      { id: "b", toHit: 0, damage: ["1 bludgeoning"] },
    ]);
  });

  it("works out resource maxima from formulas", () => {
    const body = sheet((b) => {
      scores(b, { cha: 8 });
      b.classes = [cls("Monk", 6)];
      b.resources = [
        { id: "ki", name: "Ki", max: { formula: "level", classId: "monk6", plus: 0 }, reset: "short", resetAmount: "all" },
        { id: "insp", name: "Bardic Inspiration", max: { formula: "mod:cha", classId: null, plus: 0 }, reset: "long", resetAmount: "all" },
      ];
    });
    expect(derive(body, vitals({ resourcesUsed: { ki: 2 } }), "2014").resources).toEqual([
      { id: "ki", name: "Ki", max: 6, used: 2, left: 4 },
      { id: "insp", name: "Bardic Inspiration", max: 1, used: 0, left: 1 },
    ]);
  });

  it("weighs what is carried", () => {
    const body = sheet((b) => {
      scores(b, { str: 10 });
      b.inventory.encumbrance = "variant";
      b.inventory.items = [{ id: "i", name: "Rocks", ref: null, qty: 6, weightLb: 10, equipped: false, attuned: true, container: "", notes: "" }];
    });
    expect(derive(body, vitals(), "2014").carrying).toEqual({ weight: 60, capacity: 150, state: "encumbered" });
    expect(derive(body, vitals(), "2014").attunement).toEqual({ used: 1, max: 3 });
  });

  it("applies exhaustion as each edition says", () => {
    const body = sheet((b) => {
      scores(b, { con: 10 });
      b.classes = [cls("Fighter", 4)];
    });
    const modern = derive(body, vitals({ exhaustion: 2 }), "2024");
    expect(modern.exhaustion.d20Penalty).toBe(-4);
    expect(modern.speed.walk).toBe(20);
    expect(modern.skills.athletics.bonus).toBe(-4);
    const classic = derive(body, vitals({ exhaustion: 4 }), "2014");
    expect(classic.speed.walk).toBe(15);
    expect(classic.maxHp).toBe(Math.floor((10 + 3 * 6) / 2));
    expect(classic.exhaustion).toMatchObject({ disadvantageOnChecks: true, disadvantageOnAttacksAndSaves: true });
  });
});

describe("the body schema", () => {
  it("refuses more than 20 levels, unreadable dice and stray keys", () => {
    expect(sheetBodySchema.safeParse(newBody("A")).success).toBe(true);
    const tooMany = newBody("A");
    tooMany.classes = [cls("Fighter", 15), cls("Wizard", 6)];
    expect(sheetBodySchema.safeParse(tooMany).success).toBe(false);
    const badDice = newBody("A");
    badDice.combat.attacks = [{ id: "a", name: "x", ability: "str", proficient: true, toHitBonus: 0, damage: [{ roll: "2d", type: "", addAbility: true }], range: "", properties: "", notes: "", itemId: null }];
    expect(sheetBodySchema.safeParse(badDice).success).toBe(false);
    expect(sheetBodySchema.safeParse({ ...newBody("A"), extra: 1 }).success).toBe(false);
    expect(sheetBodySchema.safeParse({ ...newBody("A"), classes: [] }).success).toBe(false);
  });
});
