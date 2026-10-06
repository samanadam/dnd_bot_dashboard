import { describe, expect, it } from "vitest";
import { newBody, sheetBodySchema, type SheetBody } from "@/lib/sheets/body";
import { applyOp, applyOps, opSchema, type Op, type OpContext, type SpellFacts } from "@/lib/sheets/ops";
import { newVitals, type Vitals } from "@/lib/sheets/vitals";

// A level 5 fighter, Con 14: 10+2 + 4*(6+2) = 44 max HP.
function body(over: (b: SheetBody) => void = () => {}): SheetBody {
  const b = newBody("Aria");
  b.abilities.con.base = 14;
  b.classes = [{ id: "f", name: "Fighter", subclass: "", level: 5, hitDie: 10, caster: "none", spellAbility: null, preparedMax: null, saveProficiencies: ["str", "con"] }];
  over(b);
  return sheetBodySchema.parse(b);
}

const SPELLS: Record<string, SpellFacts> = {
  "srd:2024/bless": { name: "Bless", level: 1, concentration: true, ritual: false },
  "srd:2024/fireball": { name: "Fireball", level: 3, concentration: false, ritual: false },
  "srd:2024/detect-magic": { name: "Detect Magic", level: 1, concentration: true, ritual: true },
};
const key = (ref: { source: string; edition?: string; slug?: string; id?: string }) => (ref.source === "srd" ? `srd:${ref.edition}/${ref.slug}` : `custom:${ref.id}`);

function context(b: SheetBody = body(), edition: "2014" | "2024" = "2024", rolls: number[] = [5]): OpContext {
  let i = 0;
  return { body: b, edition, rng: () => rolls[i++ % rolls.length], spell: (ref) => SPELLS[key(ref)] ?? null };
}

function run(vitals: Vitals, op: Op, ctx = context()) {
  const applied = applyOp(vitals, op, ctx);
  if (!applied.ok) throw new Error(applied.reason);
  return applied;
}

const full = () => newVitals(44);

describe("damage and healing", () => {
  it("takes temp HP first", () => {
    const { vitals } = run({ ...full(), tempHp: 5 }, { op: "damage", amount: 8 });
    expect(vitals).toMatchObject({ hp: 41, tempHp: 0 });
  });

  it("drops to 0 and starts death saves; a big enough overflow kills outright", () => {
    const down = run(full(), { op: "damage", amount: 50 });
    expect(down.vitals.hp).toBe(0);
    expect(down.result.instantDeath).toBe(false);
    const dead = run({ ...full(), hp: 10 }, { op: "damage", amount: 54 });
    expect(dead.result.instantDeath).toBe(true);
    expect(dead.vitals.deathSaves.failures).toBe(3);
  });

  it("counts a hit at 0 as a failed save, two on a crit, and death at the maximum", () => {
    const zero = { ...full(), hp: 0 };
    expect(run(zero, { op: "damage", amount: 3 }).vitals.deathSaves.failures).toBe(1);
    expect(run(zero, { op: "damage", amount: 3, crit: true }).vitals.deathSaves.failures).toBe(2);
    expect(run(zero, { op: "damage", amount: 44 }).result.instantDeath).toBe(true);
  });

  it("drops concentration at 0 and asks for a save otherwise", () => {
    const focused = { ...full(), concentration: { spellRef: null, name: "Bless" } };
    expect(run(focused, { op: "damage", amount: 30 }).result.concentrationDc).toBe(15);
    expect(run(focused, { op: "damage", amount: 4 }).result.concentrationDc).toBe(10);
    const lost = run(focused, { op: "damage", amount: 60 });
    expect(lost.vitals.concentration).toBeNull();
    expect(lost.result.replacedConcentration).toBe("Bless");
  });

  it("heals up to the maximum and wakes a downed character", () => {
    expect(run({ ...full(), hp: 40 }, { op: "heal", amount: 10 }).vitals.hp).toBe(44);
    const woke = run({ ...full(), hp: 0, deathSaves: { successes: 1, failures: 2 } }, { op: "heal", amount: 3 });
    expect(woke.vitals).toMatchObject({ hp: 3, deathSaves: { successes: 0, failures: 0 } });
    expect(applyOp({ ...full(), hp: 0, deathSaves: { successes: 0, failures: 3 } }, { op: "heal", amount: 3 }, context()).ok).toBe(false);
  });

  it("never stacks temporary hit points unless told to replace", () => {
    expect(run({ ...full(), tempHp: 8 }, { op: "setTemp", tempHp: 5, mode: "max" }).vitals.tempHp).toBe(8);
    expect(run({ ...full(), tempHp: 8 }, { op: "setTemp", tempHp: 5, mode: "replace" }).vitals.tempHp).toBe(5);
  });
});

describe("death saves", () => {
  it("stabilises on three successes, revives on a natural 20, and refuses when up", () => {
    let v: Vitals = { ...full(), hp: 0 };
    for (let i = 0; i < 3; i++) v = run(v, { op: "deathSave", result: "success" }).vitals;
    expect(v.stable).toBe(true);
    expect(run({ ...full(), hp: 0 }, { op: "deathSave", result: "crit" }).vitals.hp).toBe(1);
    expect(run({ ...full(), hp: 0 }, { op: "deathSave", result: "fumble" }).vitals.deathSaves.failures).toBe(2);
    expect(applyOp(full(), { op: "deathSave", result: "success" }, context()).ok).toBe(false);
  });
});

describe("slots, resources and hit dice", () => {
  const wizard = () =>
    body((b) => {
      b.classes = [{ id: "w", name: "Wizard", subclass: "", level: 5, hitDie: 6, caster: "full", spellAbility: "int", preparedMax: null, saveProficiencies: ["int", "wis"] }];
      b.spellcasting.entries = [
        { id: "s1", ref: { source: "srd", edition: "2024", slug: "bless" }, classId: "w", status: "prepared", notes: "" },
        { id: "s2", ref: { source: "srd", edition: "2024", slug: "fireball" }, classId: "w", status: "prepared", notes: "" },
        { id: "s3", ref: { source: "srd", edition: "2024", slug: "detect-magic" }, classId: "w", status: "prepared", notes: "" },
      ];
    });

  it("spends and restores slots, refusing what is not there", () => {
    const ctx = context(wizard());
    const v = run(newVitals(30), { op: "spendSlot", level: 3 }, ctx).vitals;
    expect(v.slotsSpent[2]).toBe(1);
    expect(applyOp(v, { op: "spendSlot", level: 3 }, ctx).ok).toBe(true);
    expect(applyOp({ ...v, slotsSpent: [0, 0, 2, 0, 0, 0, 0, 0, 0] }, { op: "spendSlot", level: 3 }, ctx).ok).toBe(false);
    expect(applyOp(newVitals(30), { op: "spendSlot", level: 4 }, ctx).ok).toBe(false);
    expect(applyOp(newVitals(30), { op: "restoreSlot", level: 1 }, ctx).ok).toBe(false);
  });

  it("casts: spends the slot, sets concentration and reports what it replaced", () => {
    const ctx = context(wizard());
    const bless = run(newVitals(30), { op: "cast", spellRef: { source: "srd", edition: "2024", slug: "bless" }, slot: 2 }, ctx);
    expect(bless.vitals.slotsSpent[1]).toBe(1);
    expect(bless.vitals.concentration?.name).toBe("Bless");
    const ritual = run(bless.vitals, { op: "cast", spellRef: { source: "srd", edition: "2024", slug: "detect-magic" }, slot: "ritual" }, ctx);
    expect(ritual.vitals.slotsSpent).toEqual(bless.vitals.slotsSpent);
    expect(ritual.result.replacedConcentration).toBe("Bless");
  });

  it("refuses a cast below the spell's level, of a spell not on the sheet, or a non-ritual as a ritual", () => {
    const ctx = context(wizard());
    const fireball = { source: "srd" as const, edition: "2024" as const, slug: "fireball" };
    expect(applyOp(newVitals(30), { op: "cast", spellRef: fireball, slot: 2 }, ctx)).toMatchObject({ ok: false });
    expect(applyOp(newVitals(30), { op: "cast", spellRef: fireball, slot: "ritual" }, ctx)).toMatchObject({ ok: false });
    expect(applyOp(newVitals(30), { op: "cast", spellRef: { source: "srd", edition: "2024", slug: "wish" }, slot: 9 }, ctx)).toMatchObject({ ok: false });
  });

  it("uses resources within their maximum", () => {
    const b = body((x) => {
      x.resources = [{ id: "sw", name: "Second Wind", max: 1, reset: "short", resetAmount: "all" }];
    });
    const used = run(full(), { op: "useResource", id: "sw", amount: 1 }, context(b)).vitals;
    expect(used.resourcesUsed.sw).toBe(1);
    expect(applyOp(used, { op: "useResource", id: "sw", amount: 1 }, context(b)).ok).toBe(false);
    expect(run(used, { op: "shortRest", hitDice: {} }, context(b)).vitals.resourcesUsed.sw).toBe(0);
  });

  it("rolls hit dice on the server during a short rest", () => {
    const rested = run({ ...full(), hp: 20 }, { op: "shortRest", hitDice: { 10: 2 } }, context(body(), "2024", [7]));
    // Each die: 7 + Con 2.
    expect(rested.vitals.hp).toBe(38);
    expect(rested.vitals.hitDiceSpent[10]).toBe(2);
    expect(rested.result.rolls.map((r) => r.total)).toEqual([9, 9]);
  });

  it("gets back half the hit dice in 2014 and all of them in 2024 on a long rest", () => {
    const tired = { ...full(), hp: 1, hitDiceSpent: { 6: 0, 8: 0, 10: 5, 12: 0 }, exhaustion: 2, slotsSpent: [1, 0, 0, 0, 0, 0, 0, 0, 0] };
    const classic = run(tired, { op: "longRest" }, context(body(), "2014")).vitals;
    expect(classic).toMatchObject({ hp: 44, hitDiceSpent: { 10: 3 }, exhaustion: 1, slotsSpent: [0, 0, 0, 0, 0, 0, 0, 0, 0] });
    expect(run(tired, { op: "longRest" }, context(body(), "2024")).vitals.hitDiceSpent[10]).toBe(0);
  });
});

describe("conditions, companions and batches", () => {
  it("ticks timed conditions and keeps one of each", () => {
    let v = run(full(), { op: "addCondition", name: "Poisoned", rounds: 2 }).vitals;
    v = run(v, { op: "addCondition", name: "poisoned", rounds: 1 }).vitals;
    v = run(v, { op: "addCondition", name: "Prone", rounds: null }).vitals;
    expect(v.conditions).toHaveLength(2);
    v = run(v, { op: "tickConditions" }).vitals;
    expect(v.conditions.map((c) => c.name)).toEqual(["Prone"]);
  });

  it("tracks a companion's own hit points", () => {
    const b = body((x) => {
      x.companions = [{ id: "owl", name: "Owl", kind: "familiar", ref: null, ac: 11, maxHp: 4, speed: "fly 60", attacks: [], notes: "" }];
    });
    const v = run(full(), { op: "companion", id: "owl", change: { op: "damage", amount: 3 } }, context(b)).vitals;
    expect(v.companions.owl.hp).toBe(1);
    expect(applyOp(full(), { op: "companion", id: "cat", change: { op: "heal", amount: 1 } }, context(b)).ok).toBe(false);
  });

  it("applies a batch all or nothing", () => {
    const ok = applyOps(full(), [{ op: "damage", amount: 4 }, { op: "inspiration", value: true }], context());
    expect(ok.ok && ok.vitals).toMatchObject({ hp: 40, inspiration: true });
    const refused = applyOps(full(), [{ op: "damage", amount: 4 }, { op: "spendSlot", level: 1 }], context());
    expect(refused).toMatchObject({ ok: false, index: 1 });
  });

  it("refuses unknown and malformed operations", () => {
    expect(opSchema.safeParse({ op: "kill" }).success).toBe(false);
    expect(opSchema.safeParse({ op: "damage", amount: -3 }).success).toBe(false);
    expect(opSchema.safeParse({ op: "damage", amount: 3, extra: 1 }).success).toBe(false);
    expect(opSchema.safeParse({ op: "spendSlot", level: 10 }).success).toBe(false);
  });
});
