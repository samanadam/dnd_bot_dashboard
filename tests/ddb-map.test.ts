import { describe, expect, it } from "vitest";
import caster from "./fixtures/ddb/caster.json";
import fighter from "./fixtures/ddb/fighter.json";
import multiclass from "./fixtures/ddb/multiclass.json";
import { mapCharacter } from "@/lib/ddb/map";
import { sheetBodySchema } from "@/lib/sheets/body";
import { derive } from "@/lib/sheets/derive";
import { newVitals } from "@/lib/sheets/vitals";

function mapped(raw: unknown) {
  const result = mapCharacter(raw);
  if (!result.ok) throw new Error(result.reason);
  return result.mapped;
}

describe("mapCharacter", () => {
  it("maps a fighter: identity, abilities, saves, skills, hp, ac, conditions", () => {
    const m = mapped(fighter);
    expect(m.name).toBe("Brannoc Test");
    expect(m.body.classes).toHaveLength(1);
    expect(m.body.classes[0]).toMatchObject({ name: "Fighter", subclass: "Champion", level: 3, hitDie: 10, caster: "none" });
    expect(m.body.abilities.str.base).toBe(16);
    expect(m.body.abilities.cha.base).toBe(8);
    expect(m.body.proficiencies.saves.sort()).toEqual(["con", "str"]);
    expect(m.body.proficiencies.skills.athletics).toBe("expertise");
    expect(m.body.proficiencies.skills.perception).toBe("proficient");
    expect(m.body.proficiencies.skills.stealth).toBe("none");
    // 28 base + CON mod 2 x 3 levels
    expect(m.body.combat.hp).toEqual({ mode: "manual", max: 34 });
    // chain mail 16 + shield 2
    expect(m.body.combat.ac).toEqual({ mode: "manual", value: 18 });
    expect(m.vitals.hp).toBe(25);
    expect(m.vitals.tempHp).toBe(3);
    expect(m.vitals.deathSaves).toEqual({ successes: 2, failures: 1 });
    expect(m.vitals.inspiration).toBe(true);
    expect(m.vitals.conditions.map((c) => c.name)).toEqual(["Poisoned"]);
    expect(m.vitals.exhaustion).toBe(2);
    expect(m.edition).toBe("2024");
  });

  it("maps a caster: slots used, unarmored ac, spell ability", () => {
    const m = mapped(caster);
    expect(m.body.classes[0]).toMatchObject({ name: "Wizard", caster: "full", spellAbility: "int" });
    expect(m.vitals.slotsSpent.slice(0, 3)).toEqual([2, 1, 0]);
    expect(m.body.combat.hp).toEqual({ mode: "manual", max: 17 });
    expect(m.body.combat.ac).toEqual({ mode: "manual", value: 11 });
    expect(m.body.identity).toMatchObject({ species: "Human", background: "Noble", xp: 1250 });
  });

  it("maps a multiclass: overrides, bonuses, pact slots, total level hp", () => {
    const m = mapped(multiclass);
    expect(m.body.classes.map((c) => `${c.name} ${c.level}`)).toEqual(["Warlock 3", "Sorcerer 2"]);
    expect(m.body.abilities.str.override).toBe(10);
    expect(m.body.abilities.cha).toMatchObject({ base: 16, bonus: 2 });
    expect(m.body.combat.hp).toEqual({ mode: "manual", max: 35 });
    expect(m.vitals.pactSpent).toBe(1);
  });

  it("produces a body that passes the sheet schema and derives the same max hp", () => {
    for (const raw of [fighter, caster, multiclass]) {
      const m = mapped(raw);
      expect(sheetBodySchema.safeParse(m.body).success).toBe(true);
      expect(derive(m.body, newVitals(1), m.edition).maxHp).toBe(m.body.combat.hp.mode === "manual" ? m.body.combat.hp.max : -1);
    }
  });

  it("explains what it could not read", () => {
    expect(mapped(caster).warnings.join(" ")).toMatch(/armor class/i);
  });

  it("never throws on missing or odd data", () => {
    expect(mapCharacter(null).ok).toBe(false);
    expect(mapCharacter({}).ok).toBe(false);
    expect(mapCharacter("nope").ok).toBe(false);
    const noClasses = { ...fighter, data: { ...fighter.data, classes: [] } };
    expect(mapCharacter(noClasses).ok).toBe(false);
    const nullStat = { ...fighter, data: { ...fighter.data, stats: [null, ...fighter.data.stats.slice(1)] } };
    expect(() => mapCharacter(nullStat)).not.toThrow();
    for (const key of Object.keys(fighter.data)) {
      const data: Record<string, unknown> = { ...fighter.data };
      delete data[key];
      expect(() => mapCharacter({ ...fighter, data })).not.toThrow();
    }
    for (const key of Object.keys(fighter.data)) {
      const data: Record<string, unknown> = { ...fighter.data, [key]: null };
      expect(() => mapCharacter({ ...fighter, data })).not.toThrow();
    }
  });
});
