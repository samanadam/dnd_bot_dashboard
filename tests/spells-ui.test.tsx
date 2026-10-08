import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FeatBlockView } from "@/components/dm/spells/FeatBrowser";
import { componentsLine, durationLine, SpellBlockView } from "@/components/dm/spells/SpellBlockView";
import { diceError } from "@/components/dm/spells/SpellForm";
import type { SpellBlock } from "@/lib/dm/spells";

const web: SpellBlock = {
  name: "Web",
  level: 2,
  school: "conjuration",
  castingTime: "1 action",
  ritual: false,
  range: "60 feet",
  components: { verbal: true, somatic: true, material: true, materialText: "a bit of spiderweb", materialCostGp: null, materialConsumed: false },
  duration: "Up to 1 hour",
  concentration: true,
  classes: ["Sorcerer", "Wizard"],
  attack: null,
  save: "dex",
  effect: null,
  scaling: null,
  description: "You conjure a mass of sticky webbing.",
  higherLevel: "",
};

const bolt: SpellBlock = {
  ...web,
  name: "Fire Bolt",
  level: 0,
  school: "evocation",
  components: { verbal: true, somatic: true, material: false, materialText: "", materialCostGp: null, materialConsumed: false },
  duration: "Instantaneous",
  concentration: false,
  attack: "ranged",
  save: null,
  effect: { kind: "damage", roll: "1d10", types: ["fire"] },
  scaling: { by: "character", steps: [{ at: 5, roll: "2d10" }, { at: 11, roll: "3d10" }] },
};

describe("spell view", () => {
  it("reads like the books", () => {
    const html = renderToStaticMarkup(<SpellBlockView spell={web} />);
    expect(html).toContain("2nd-level conjuration");
    expect(html).toContain("V, S, M (a bit of spiderweb)");
    expect(html).toContain("Concentration, up to 1 hour");
    expect(html).toContain("Dexterity save");
    expect(html).toContain("Wizard");
  });

  it("shows a cantrip, its attack, damage and scaling table", () => {
    const html = renderToStaticMarkup(<SpellBlockView spell={bolt} />);
    expect(html).toContain("Evocation cantrip");
    expect(html).toContain("Ranged spell attack");
    expect(html).toContain("1d10 fire");
    expect(html).toContain("By character level");
    expect(html).toContain("Level 11+");
  });

  it("formats costly consumed materials and durations", () => {
    expect(componentsLine({ components: { verbal: true, somatic: false, material: true, materialText: "a diamond", materialCostGp: 500, materialConsumed: true } })).toBe(
      "V, M (a diamond; worth 500+ gp, consumed)",
    );
    expect(componentsLine({ components: { verbal: false, somatic: false, material: false, materialText: "", materialCostGp: null, materialConsumed: false } })).toBe("None");
    expect(durationLine({ duration: "1 minute", concentration: true })).toBe("Concentration, up to 1 minute");
    expect(durationLine({ duration: "Instantaneous", concentration: false })).toBe("Instantaneous");
  });

  it("flags dice the roller cannot read", () => {
    expect(diceError("2d")).toBe("Use dice like 2d6+3.");
    expect(diceError("2d6+3")).toBeNull();
    expect(diceError("")).toBeNull();
  });
});

describe("feat view", () => {
  it("shows category, prerequisite and repeatable", () => {
    const html = renderToStaticMarkup(<FeatBlockView feat={{ name: "Grappler", category: "General", prerequisite: "Level 4+", repeatable: true, description: "Hold on." }} />);
    expect(html).toContain("General · Prerequisite: Level 4+ · Repeatable");
  });
});
