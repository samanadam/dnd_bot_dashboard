import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { convertMonsterPage } from "@/lib/dm/ddbMonsters";
import { feature, featurePeriodInBold, featurePeriodOutside, featureSplit, line, pageHtml, plain, section, statBlockHtml, type BlockOptions } from "./fixtures/ddb-pages";

function one(options: BlockOptions = {}) {
  const result = convertMonsterPage(pageHtml([statBlockHtml(options)]));
  expect(result.issues).toEqual([]);
  expect(result.blocks).toHaveLength(1);
  return result.blocks[0];
}

describe("convertMonsterPage: header lines", () => {
  it("reads name, size, type, alignment, AC, initiative, HP, hit dice and speed", () => {
    const { statBlock, sourceKey } = one();
    expect(sourceKey).toBe("9000001");
    expect(statBlock).toMatchObject({
      name: "Ember Drake", size: "Medium", type: "Dragon", alignment: "Neutral",
      ac: 14, acNote: "", initiativeBonus: 2, hp: 27, hitDice: "5d8+5", speed: "30 ft., Fly 60 ft.",
    });
  });

  it("takes the first size of 'X or Y' and keeps a subtype in the type", () => {
    const { statBlock } = one({ firstLine: "Medium or Small Fiend (Devil), Lawful Evil" });
    expect(statBlock).toMatchObject({ size: "Medium", type: "Fiend (Devil)", alignment: "Lawful Evil" });
  });

  it("normalises the Unicode minus in hit dice and initiative", () => {
    const { statBlock } = one({ hp: "1 (1d4 − 1)", ac: "12 <strong>Initiative</strong> −1 (9)" });
    expect(statBlock).toMatchObject({ hp: 1, hitDice: "1d4-1", initiativeBonus: -1 });
  });

  it("falls back to the heading anchor when the name is not a link", () => {
    expect(one({ id: null, name: "Plain Heading" }).sourceKey).toBe("PlainHeading");
  });

  it("reads an h3 heading as well as h4", () => {
    expect(one({ headingTag: "h3", name: "Third Level" }).statBlock.name).toBe("Third Level");
  });
});

describe("convertMonsterPage: abilities and proficiencies", () => {
  it("stores scores, and only the saves that differ from the modifier", () => {
    const rows: BlockOptions["rows"] = [[20, "+5", "+5"], [11, "+0", "+6"], [20, "+5", "+5"], [12, "+1", "+1"], [16, "+3", "+9"], [18, "+4", "+4"]];
    const { statBlock } = one({ rows });
    expect(statBlock.abilities).toEqual({ str: 20, dex: 11, con: 20, int: 12, wis: 16, cha: 18 });
    expect(statBlock.saves).toEqual({ dex: 6, wis: 9 });
  });

  it("reads skills as snake_case and drops a trailing note", () => {
    const { statBlock } = one({
      lines: [line("Skills", "Arcana +3, Sleight of Hand +5, Stealth +4 (+6 in snake form)"), line("Senses", "Passive Perception 10"), line("Languages", "None")],
    });
    expect(statBlock.skills).toEqual({ arcana: 3, sleight_of_hand: 5, stealth: 4 });
  });

  it("splits Immunities into damage and condition immunities", () => {
    const { statBlock } = one({
      lines: [line("Immunities", "Necrotic, Poison; Exhaustion, Frightened, Poisoned"), line("Resistances", "Cold"), line("Vulnerabilities", "Radiant"), line("Senses", "Passive Perception 10"), line("Languages", "—")],
    });
    expect(statBlock).toMatchObject({
      damageImmunities: "Necrotic, Poison", conditionImmunities: "Exhaustion, Frightened, Poisoned",
      damageResistances: "Cold", damageVulnerabilities: "Radiant", senses: "Passive Perception 10", languages: "—",
    });
  });

  it("puts a condition-only Immunities line in condition immunities", () => {
    expect(one({ lines: [line("Immunities", "Petrified"), line("Senses", "x"), line("Languages", "y")] }).statBlock).toMatchObject({ damageImmunities: "", conditionImmunities: "Petrified" });
  });

  it("reads CR, the book's XP (first figure) and the proficiency bonus", () => {
    expect(one({ cr: "5 (XP 1,800, or 2,300 in lair; PB +3)" }).statBlock).toMatchObject({ cr: "5", xp: 1800, proficiencyBonus: 3 });
    expect(one({ cr: "1/8 (XP 25; PB +2)" }).statBlock).toMatchObject({ cr: "1/8", xp: 25 });
  });

  it("keeps a Gear line as the first trait", () => {
    const { statBlock } = one({
      lines: [line("Gear", "Quarterstaff, Spyglass"), line("Senses", "x"), line("Languages", "y")],
      body: section("Traits") + feature("Keen Eyes", "Sees far."),
    });
    expect(statBlock.traits.map((t) => t.name)).toEqual(["Gear", "Keen Eyes"]);
    expect(statBlock.traits[0].desc).toBe("Quarterstaff, Spyglass");
  });
});

describe("convertMonsterPage: features", () => {
  it("reads every feature-name shape as one feature with the right name", () => {
    const { statBlock } = one({
      body:
        section("Traits") +
        feature("Plain Name", "One.") +
        featurePeriodInBold("Recharging Gaze (Recharge 5–6)", "Two.") +
        featurePeriodOutside("Outside Period", "Three.") +
        featureSplit("Split Name (Recharge", "5–6)", "Four."),
    });
    expect(statBlock.traits).toEqual([
      { name: "Plain Name", desc: "One." },
      { name: "Recharging Gaze (Recharge 5–6)", desc: "Two." },
      { name: "Outside Period", desc: "Three." },
      { name: "Split Name (Recharge 5–6)", desc: "Four." },
    ]);
  });

  it("sorts features into traits, actions, bonus actions, reactions and legendary actions", () => {
    const { statBlock } = one({
      body:
        section("Traits") + feature("T", "t.") + section("Actions") + feature("A", "a.") + section("Bonus Actions") + feature("B", "b.") +
        section("Reactions") + feature("R", "r.") + section("Legendary Actions") +
        plain("Legendary Action Uses: 3. Immediately after another creature’s turn.") + feature("L", "l."),
    });
    expect([statBlock.traits, statBlock.actions, statBlock.bonusActions, statBlock.reactions, statBlock.legendaryActions].map((list) => list.map((f) => f.name))).toEqual([["T"], ["A"], ["B"], ["R"], ["L"]]);
    expect(statBlock.legendaryDescription).toBe("Legendary Action Uses: 3. Immediately after another creature’s turn.");
  });

  it("appends spell lines and d6 list lines to the feature before them", () => {
    const { statBlock } = one({
      body:
        section("Actions") +
        feature("Spellcasting", "The drake casts one of the following spells:") +
        line("At Will:", "<em>Mage Hand</em>, <em>Message</em>") +
        line("1/Day Each:", "<em>Fog Cloud</em>") +
        feature("Wild Surge", "Roll a d6:") +
        `<p><strong>1–4.</strong> Nothing happens.</p>`,
    });
    expect(statBlock.actions.map((a) => a.name)).toEqual(["Spellcasting", "Wild Surge"]);
    expect(statBlock.actions[0].desc).toBe("The drake casts one of the following spells:\nAt Will: Mage Hand, Message\n1/Day Each: Fog Cloud");
    expect(statBlock.actions[1].desc).toBe("Roll a d6:\n1–4. Nothing happens.");
  });

  it("drops Habitat and Treasure lines", () => {
    const { statBlock } = one({ body: section("Actions") + feature("Bite", "Nom.") + line("Habitat:", "Hills") + line("Treasure:", "Any") });
    expect(statBlock.actions).toEqual([{ name: "Bite", desc: "Nom." }]);
  });
});

describe("convertMonsterPage: attacks", () => {
  const attack = (text: string) => one({ body: section("Actions") + feature("Bite", text) }).statBlock.actions[0].attack;

  it("reads to-hit and a damage part", () => {
    expect(attack("<em>Melee Attack Roll:</em> +5, reach 5 ft. <em>Hit:</em> 7 (1d8 + 3) Slashing damage.")).toEqual({ toHit: 5, damage: "1d8+3", damageType: "Slashing" });
  });

  it("reads a second damage part", () => {
    expect(attack("<em>Melee Attack Roll:</em> +5, reach 5 ft. <em>Hit:</em> 7 (1d8 + 3) Slashing damage plus 4 (1d8) Fire damage.")).toEqual({
      toHit: 5, damage: "1d8+3", damageType: "Slashing", extraDamage: "1d8", extraDamageType: "Fire",
    });
  });

  it("reads flat damage and a Unicode minus", () => {
    expect(attack("<em>Melee Attack Roll:</em> +4, reach 5 ft. <em>Hit:</em> 3 Piercing damage.")).toEqual({ toHit: 4, damage: "3", damageType: "Piercing" });
    expect(attack("<em>Melee Attack Roll:</em> +1, reach 5 ft. <em>Hit:</em> 1 (1d4 − 1) Piercing damage.")).toMatchObject({ toHit: 1, damage: "1d4-1" });
  });

  it("gives no attack to a feature without an attack roll", () => {
    expect(attack("The drake flaps.")).toBeUndefined();
  });
});

describe("convertMonsterPage: bad input", () => {
  it("reports a block it cannot read and still converts the others", () => {
    const result = convertMonsterPage(pageHtml([statBlockHtml({ name: "Broken One", noTables: true }), statBlockHtml({ name: "Fine One", id: "9000002" })]));
    expect(result.found).toBe(2);
    expect(result.blocks.map((b) => b.name)).toEqual(["Fine One"]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].name).toBe("Broken One");
    expect(result.found).toBe(result.blocks.length + result.issues.length);
  });

  it("reports a block whose text is over the schema's length cap", () => {
    const result = convertMonsterPage(pageHtml([statBlockHtml({ body: section("Actions") + feature("Long", "x".repeat(4100)) })]));
    expect(result.blocks).toEqual([]);
    expect(result.issues[0].reason).toMatch(/actions\.0\.desc/);
  });

  it("finds nothing in a page without stat blocks", () => {
    expect(convertMonsterPage("<html><body><p>hello</p></body></html>")).toEqual({ blocks: [], issues: [], found: 0 });
  });
});

describe.runIf(process.env.DDB_PAGES_DIR)("captured pages (local only)", () => {
  it("converts every stat block with no issues", () => {
    const dir = process.env.DDB_PAGES_DIR as string;
    let found = 0;
    let blocks = 0;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".html"))) {
      const result = convertMonsterPage(readFileSync(join(dir, file), "utf8"));
      expect(result.issues, file).toEqual([]);
      found += result.found;
      blocks += result.blocks.length;
    }
    console.log(`captured pages: ${blocks} of ${found} stat blocks converted`);
    expect(blocks).toBe(found);
  });
});
