import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/dm/db";
import { customFeatSchema, FeatRepo, MAX_CUSTOM_FEATS, type CustomFeatInput } from "@/lib/dm/feats";
import { isSrdSpellDocument, normaliseOpen5eFeat, normaliseOpen5eSpell, spellSlug } from "@/lib/dm/openSpells";
import { customSpellSchema, MAX_CUSTOM_SPELLS, spellBlockSchema, spellLevelLine, SpellRepo, type CustomSpellInput } from "@/lib/dm/spells";

const fixture = JSON.parse(readFileSync("tests/fixtures/open5e-spells.json", "utf8")) as {
  spells: Array<{ key: string; casting_time: string; document: { key: string } }>;
  feats: Array<{ key: string }>;
};
const raw = (key: string) => fixture.spells.find((s) => s.key === key)!;
const feat = (key: string) => fixture.feats.find((f) => f.key === key)!;

describe("Open5e spells", () => {
  it("reads a cantrip that grows with the caster's level", () => {
    const spell = normaliseOpen5eSpell(raw("srd-2024_fire-bolt"));
    expect(spell).toMatchObject({ name: "Fire Bolt", level: 0, school: "evocation", castingTime: "1 action", attack: "ranged", save: null });
    expect(spell.effect).toEqual({ kind: "damage", roll: "1d10", types: ["fire"] });
    expect(spell.scaling).toEqual({
      by: "character",
      steps: [
        { at: 5, roll: "2d10" },
        { at: 11, roll: "3d10" },
        { at: 17, roll: "4d10" },
      ],
    });
    expect(spellSlug("srd-2024_fire-bolt")).toBe("fire-bolt");
  });

  it("reads a levelled spell that grows with its slot", () => {
    const spell = normaliseOpen5eSpell(raw("srd-2024_acid-arrow"));
    expect(spell.level).toBe(2);
    expect(spell.scaling?.by).toBe("slot");
    expect(spell.scaling?.steps[0]).toEqual({ at: 3, roll: "5d4" });
    expect(spell.components).toMatchObject({ verbal: true, somatic: true, material: true, materialText: "powdered rhubarb leaf" });
  });

  it("knows healing from damage", () => {
    expect(normaliseOpen5eSpell(raw("srd-2024_cure-wounds")).effect).toEqual({ kind: "healing", roll: "2d8", types: [] });
    // Bless rolls a d4 but deals nothing: no effect, the text explains it.
    expect(normaliseOpen5eSpell(raw("srd-2024_bless")).effect).toBeNull();
  });

  it("keeps a reaction's trigger, a ritual, a costly consumed material and a cone", () => {
    expect(normaliseOpen5eSpell(raw("srd_counterspell")).castingTime).toMatch(/^1 reaction, which you take when/);
    expect(normaliseOpen5eSpell(raw("srd_detect-magic")).ritual).toBe(true);
    expect(normaliseOpen5eSpell(raw("srd_raise-dead")).components).toMatchObject({ materialCostGp: 500, materialConsumed: true });
    expect(normaliseOpen5eSpell(raw("srd_burning-hands")).range).toBe("Self (15-foot cone)");
  });

  it("stops on a casting time it does not know", () => {
    expect(() => normaliseOpen5eSpell({ ...raw("srd-2024_fire-bolt"), casting_time: "2actions" })).toThrow(/unknown casting time/);
  });

  it("accepts only the two SRD documents", () => {
    expect(isSrdSpellDocument("srd-2014")).toBe(true);
    expect(isSrdSpellDocument("srd-2024")).toBe(true);
    expect(isSrdSpellDocument("tob")).toBe(false);
    expect(isSrdSpellDocument("toString")).toBe(false);
    expect(fixture.spells.filter((s) => !isSrdSpellDocument(s.document.key)).map((s) => s.key)).toEqual(["tob_burning-hands"]);
  });

  it("names levels the way the books do", () => {
    expect(spellLevelLine({ level: 0, school: "evocation" })).toBe("Evocation cantrip");
    expect(spellLevelLine({ level: 1, school: "abjuration" })).toBe("1st-level abjuration");
    expect(spellLevelLine({ level: 2, school: "evocation" })).toBe("2nd-level evocation");
    expect(spellLevelLine({ level: 3, school: "necromancy" })).toBe("3rd-level necromancy");
    expect(spellLevelLine({ level: 9, school: "conjuration" })).toBe("9th-level conjuration");
  });
});

describe("Open5e feats", () => {
  it("folds benefits into the description and spots repeatable feats", () => {
    const asi = normaliseOpen5eFeat(feat("srd-2024_ability-score-improvement"));
    expect(asi).toMatchObject({ name: "Ability Score Improvement", category: "General", prerequisite: "Level 4+", repeatable: true });
    expect(asi.description).toMatch(/Increase one ability score/);
    const grappler = normaliseOpen5eFeat(feat("srd_grappler"));
    expect(grappler.repeatable).toBe(false);
    expect(grappler.description).toMatch(/advantage on attack rolls/);
  });
});

const spell: CustomSpellInput = {
  name: "Moonbeam Lance",
  level: 3,
  school: "evocation",
  castingTime: "1 action",
  ritual: false,
  range: "60 feet",
  components: { verbal: true, somatic: false, material: false, materialText: "", materialCostGp: null, materialConsumed: false },
  duration: "Instantaneous",
  concentration: false,
  classes: ["Wizard"],
  attack: "ranged",
  save: null,
  effect: { kind: "damage", roll: "4d8", types: ["radiant"] },
  scaling: { by: "slot", steps: [{ at: 4, roll: "5d8" }] },
  description: "A lance of moonlight.",
  higherLevel: "",
};

const CAMPAIGN = "0123456789ab";
const OTHER = "ba9876543210";

describe("spell blocks", () => {
  it("refuses out-of-range levels, unknown schools, stray keys and unreadable dice", () => {
    expect(spellBlockSchema.safeParse(spell).success).toBe(true);
    expect(spellBlockSchema.safeParse({ ...spell, level: 10 }).success).toBe(false);
    expect(spellBlockSchema.safeParse({ ...spell, school: "chronurgy" }).success).toBe(false);
    expect(spellBlockSchema.safeParse({ ...spell, extra: true }).success).toBe(false);
    expect(spellBlockSchema.safeParse({ ...spell, effect: { kind: "damage", roll: "2d", types: [] } }).success).toBe(false);
    expect(spellBlockSchema.safeParse({ ...spell, scaling: { by: "slot", steps: [] } }).success).toBe(false);
    expect(customSpellSchema.safeParse({ ...spell, campaignId: "nope" }).success).toBe(false);
  });
});

describe("custom spells", () => {
  it("stores, reads back, updates and deletes a spell", () => {
    const repo = new SpellRepo(openDatabase(":memory:"));
    const created = repo.create({ ...spell, campaignId: CAMPAIGN })!;
    expect(created).toMatchObject({ name: "Moonbeam Lance", campaignId: CAMPAIGN, authorUserId: null, shared: true });
    expect(repo.get(created.id)).toEqual(created);
    expect(repo.update(created.id, { ...spell, name: "Moonbeam Lance II" })).toMatchObject({ name: "Moonbeam Lance II", campaignId: CAMPAIGN });
    expect(repo.update(created.id, { ...spell, campaignId: null })?.campaignId).toBeNull();
    expect(repo.remove(created.id)).toBe(true);
    expect(repo.get(created.id)).toBeNull();
    expect(repo.remove(created.id)).toBe(false);
  });

  it("filters by campaign selection", () => {
    const repo = new SpellRepo(openDatabase(":memory:"));
    repo.create({ ...spell, name: "A", campaignId: CAMPAIGN });
    repo.create({ ...spell, name: "B", campaignId: OTHER });
    repo.create({ ...spell, name: "C", campaignId: null });
    expect(repo.list().map((s) => s.name)).toEqual(["A", "B", "C"]);
    expect(repo.list(CAMPAIGN).map((s) => s.name)).toEqual(["A"]);
    expect(repo.list("unassigned").map((s) => s.name)).toEqual(["C"]);
  });

  it("keeps homebrew private until it is shared", () => {
    const repo = new SpellRepo(openDatabase(":memory:"));
    const brew = repo.create({ ...spell, campaignId: CAMPAIGN }, { userId: "123456789012345678", shared: false })!;
    expect(brew).toMatchObject({ authorUserId: "123456789012345678", shared: false });
    expect(repo.setShared(brew.id, true)?.shared).toBe(true);
    expect(repo.setShared("nope", true)).toBeNull();
  });

  it("refuses a malformed id without touching the database", () => {
    const repo = new SpellRepo(openDatabase(":memory:"));
    expect(repo.get("1 OR 1=1")).toBeNull();
    expect(repo.update("nope", spell)).toBeNull();
    expect(repo.remove("nope")).toBe(false);
  });

  it("stops at the limit", () => {
    const db = openDatabase(":memory:");
    const insert = db.prepare("INSERT INTO spells (id, name, campaign_id, data, created_at, updated_at) VALUES (?, 'x', NULL, '{}', '', '')");
    for (let index = 0; index < MAX_CUSTOM_SPELLS; index++) insert.run(`id-${index}`);
    expect(new SpellRepo(db).create(spell)).toBeNull();
  });

  it("does not return a stored spell whose data was damaged", () => {
    const db = openDatabase(":memory:");
    const repo = new SpellRepo(db);
    const created = repo.create(spell)!;
    db.prepare("UPDATE spells SET data = ? WHERE id = ?").run('{"level":"high"}', created.id);
    expect(repo.get(created.id)).toBeNull();
    expect(repo.list()).toEqual([]);
    db.prepare("UPDATE spells SET data = ? WHERE id = ?").run("not json", created.id);
    expect(repo.get(created.id)).toBeNull();
  });
});

const customFeat: CustomFeatInput = { name: "Moonsworn", category: "General", prerequisite: "", repeatable: false, description: "You see in moonlight." };

describe("custom feats", () => {
  it("stores, filters, shares, and stops at the limit", () => {
    const db = openDatabase(":memory:");
    const repo = new FeatRepo(db);
    const created = repo.create({ ...customFeat, campaignId: CAMPAIGN }, { userId: "123456789012345678", shared: false })!;
    expect(created).toMatchObject({ name: "Moonsworn", shared: false, campaignId: CAMPAIGN });
    expect(repo.list(OTHER)).toEqual([]);
    expect(repo.setShared(created.id, true)?.shared).toBe(true);
    expect(customFeatSchema.safeParse({ ...customFeat, prerequisite: "x".repeat(201) }).success).toBe(false);
    const insert = db.prepare("INSERT INTO feats (id, name, campaign_id, data, created_at, updated_at) VALUES (?, 'x', NULL, '{}', '', '')");
    for (let index = 1; index < MAX_CUSTOM_FEATS; index++) insert.run(`id-${index}`);
    expect(repo.create(customFeat)).toBeNull();
  });
});
