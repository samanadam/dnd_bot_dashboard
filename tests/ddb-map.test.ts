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
    // chain mail 16 + its +1, shield 2; the unattuned ring and the unworn cloak add nothing
    expect(m.body.combat.ac).toEqual({ mode: "manual", value: 19 });
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

  it("adds ability score bonuses that come from feats and the like, next to the stored bonus", () => {
    const raw = structuredClone(caster) as { data: { modifiers: Record<string, unknown[]>; bonusStats?: Array<{ id: number; value: number | null }> } };
    const entry = (subType: string, extra: Record<string, unknown> = {}) => ({ type: "bonus", subType, value: 1, isGranted: true, restriction: null, ...extra });
    raw.data.modifiers.feat = [...(raw.data.modifiers.feat ?? []), entry("dexterity-score"), entry("intelligence-score"), entry("wisdom-score", { restriction: "only at night" }), entry("charisma-score", { isGranted: false })];
    const before = mapped(caster);
    const m = mapped(raw);
    expect(m.body.abilities.dex.bonus).toBe(before.body.abilities.dex.bonus + 1);
    expect(m.body.abilities.int.bonus).toBe(before.body.abilities.int.bonus + 1);
    // conditional and not-granted bonuses are not counted
    expect(m.body.abilities.wis.bonus).toBe(before.body.abilities.wis.bonus);
    expect(m.body.abilities.cha.bonus).toBe(before.body.abilities.cha.bonus);
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

describe("mapCharacter inventory and coins", () => {
  const CHARACTER = 777;
  const entry = (id: number, name: string, extra: Record<string, unknown> = {}, definition: Record<string, unknown> = {}) => ({
    id,
    quantity: 1,
    equipped: false,
    isAttuned: false,
    containerEntityId: CHARACTER,
    definition: { id: id + 1000, name, weight: 1, description: "", ...definition },
    ...extra,
  });
  const withData = (extra: Record<string, unknown>) => {
    const raw = structuredClone(caster) as { data: Record<string, unknown> };
    Object.assign(raw.data, { id: CHARACTER }, extra);
    return raw;
  };

  it("copies items with quantity, weight per item, equipped, attuned and where they are carried", () => {
    const m = mapped(
      withData({
        inventory: [
          entry(10, "Backpack", {}, { weight: 5 }),
          entry(11, "Lamp", { containerEntityId: 10 }, { weight: 1 }),
          entry(12, "Dagger", { equipped: true, quantity: 2 }, { weight: 1 }),
          entry(13, "Ring of Protection", { isAttuned: true, equipped: true }, { weight: 0 }),
        ],
        currencies: { cp: 3, sp: 4, ep: 0, gp: 28, pp: 1 },
      }),
    );
    expect(m.body.inventory.items).toEqual([
      { id: "d10", name: "Backpack", ref: null, qty: 1, weightLb: 5, equipped: false, attuned: false, container: "", notes: "" },
      { id: "d11", name: "Lamp", ref: null, qty: 1, weightLb: 1, equipped: false, attuned: false, container: "Backpack", notes: "" },
      { id: "d12", name: "Dagger", ref: null, qty: 2, weightLb: 1, equipped: true, attuned: false, container: "", notes: "" },
      { id: "d13", name: "Ring of Protection", ref: null, qty: 1, weightLb: 0, equipped: true, attuned: true, container: "", notes: "" },
    ]);
    expect(m.body.inventory.currency).toEqual({ cp: 3, sp: 4, ep: 0, gp: 28, pp: 1 });
    // The rules the player set on the portal stay as they were.
    expect(m.body.inventory.attunementMax).toBe(3);
    expect(m.body.inventory.encumbrance).toBe("off");
  });

  it("copies custom items too", () => {
    const m = mapped(withData({ inventory: [], customItems: [{ id: 5, name: "Solvane Signet", description: "A family ring.", weight: 0.5, quantity: 2, notes: null, cost: null }] }));
    expect(m.body.inventory.items).toEqual([{ id: "c5", name: "Solvane Signet", ref: null, qty: 2, weightLb: 0.5, equipped: false, attuned: false, container: "", notes: "A family ring." }]);
  });

  it("turns the HTML description into plain text, capped", () => {
    const html = "<p>A <strong>fine</strong> blade&nbsp;&amp; sheath.</p><ul><li>Light</li><li>Finesse</li></ul>";
    const m = mapped(withData({ inventory: [entry(1, "Dagger", {}, { description: html }), entry(2, "Tome", {}, { description: `<p>${"x".repeat(3000)}</p>` })] }));
    expect(m.body.inventory.items[0].notes).toBe("A fine blade & sheath. Light Finesse");
    expect(m.body.inventory.items[1].notes).toHaveLength(1000);
  });

  it("skips entries without a name and keeps numbers in range", () => {
    const m = mapped(
      withData({
        inventory: [entry(1, "", {}), entry(2, "Bag of Coins", { quantity: 99999 }, { weight: -3 }), entry(3, "Anvil", {}, { weight: 99999 }), { id: 4, definition: null }, "junk", null],
        currencies: { cp: -5, sp: "many", gp: 1e12 },
      }),
    );
    expect(m.body.inventory.items.map((i) => [i.name, i.qty, i.weightLb])).toEqual([
      ["Bag of Coins", 9999, 0],
      ["Anvil", 1, 10_000],
    ]);
    expect(m.body.inventory.currency).toEqual({ cp: 0, sp: 0, ep: 0, gp: 10_000_000, pp: 0 });
  });

  it("copies the first 300 items and says so when there are more", () => {
    const inventory = Array.from({ length: 305 }, (_, i) => entry(i + 1, `Item ${i + 1}`));
    const m = mapped(withData({ inventory }));
    expect(m.body.inventory.items).toHaveLength(300);
    expect(m.warnings.some((w) => /300/.test(w))).toBe(true);
  });

  it("leaves the inventory empty, and never throws, when it is not a list", () => {
    for (const bad of ["junk", 5, { a: 1 }, null]) {
      const m = mapped(withData({ inventory: bad, customItems: bad, currencies: bad }));
      expect(m.body.inventory.items).toEqual([]);
      expect(m.body.inventory.currency).toEqual({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });
    }
  });
});
