import { describe, expect, it } from "vitest";
import {
  addCombatant, damage, encounterSchema, endCombat, heal, healthState, newEncounter, nextTurn, patchCombatant,
  previousTurn, removeCombatant, rollInitiative, setInitiative, setTempHp, startCombat, toggleCondition,
  type Encounter, type NewCombatant,
} from "@/lib/dm/encounter";

function ids() {
  let n = 0;
  return () => `c${++n}`;
}

const base = (over: Partial<NewCombatant> = {}): NewCombatant => ({
  name: "Goblin", kind: "monster", ref: null, initiative: null, initiativeBonus: 2, ac: 15, hp: 7, maxHp: 7,
  tempHp: 0, conditions: [], concentration: false, friendly: false, notes: "", ...over,
});

function party(): Encounter {
  const id = ids();
  let enc = newEncounter("Road ambush");
  enc = addCombatant(enc, base(), id);
  enc = addCombatant(enc, base(), id);
  enc = addCombatant(enc, base({ name: "Aria", kind: "player", initiativeBonus: 3, ac: 16, hp: 24, maxHp: 24 }), id);
  return enc;
}

const byId = (enc: Encounter, id: string) => enc.combatants.find((c) => c.id === id)!;

describe("encounter", () => {
  it("numbers duplicate names", () => {
    expect(party().combatants.map((c) => c.name)).toEqual(["Goblin", "Goblin 2", "Aria"]);
  });

  it("rolls initiative with bonus and sorts, ties broken by bonus then name", () => {
    const enc = party();
    const rolls = [10, 13, 9]; // Goblin 12, Goblin 2 15, Aria 12
    let i = 0;
    const rolled = rollInitiative(enc, enc.combatants.map((c) => c.id), () => rolls[i++]);
    expect(rolled.combatants.map((c) => `${c.name}:${c.initiative}`)).toEqual(["Goblin 2:15", "Aria:12", "Goblin:12"]);
  });

  it("keeps the current actor when initiative changes mid-combat", () => {
    let enc = startCombat(rollInitiative(party(), ["c1", "c2", "c3"], () => 10));
    enc = nextTurn(enc);
    const actor = enc.combatants[enc.turn].id;
    enc = setInitiative(enc, "c3", 1);
    expect(enc.combatants[enc.turn].id).toBe(actor);
  });

  it("advances turns, wraps rounds and ticks conditions as the actor's turn starts", () => {
    // Everyone rolls 10: Aria 13, Goblin 12, Goblin 2 12.
    const start = party();
    let enc = startCombat(rollInitiative(start, start.combatants.map((c) => c.id), () => 10));
    expect(enc.combatants.map((c) => c.name)).toEqual(["Aria", "Goblin", "Goblin 2"]);
    const [first, second] = enc.combatants.map((c) => c.id);
    enc = toggleCondition(enc, second, "Poisoned", 1);
    enc = toggleCondition(enc, first, "Prone", null);
    expect(enc.round).toBe(1);

    enc = nextTurn(enc);
    expect(enc.combatants[enc.turn].id).toBe(second);
    expect(byId(enc, second).conditions).toEqual([]);

    enc = nextTurn(nextTurn(enc));
    expect(enc.round).toBe(2);
    expect(enc.combatants[enc.turn].id).toBe(first);
    expect(byId(enc, first).conditions).toEqual([{ name: "Prone", rounds: null }]);

    enc = previousTurn(enc);
    expect(enc).toMatchObject({ round: 1, turn: 2 });
    expect(previousTurn(startCombat(party()))).toMatchObject({ round: 1, turn: 0 });
    expect(endCombat(enc)).toMatchObject({ round: 0, turn: 0 });
  });

  it("removing combatants keeps the turn on the right actor", () => {
    let enc = startCombat(rollInitiative(party(), ["c1", "c2", "c3"], () => 10));
    enc = nextTurn(nextTurn(enc)); // Goblin 2's turn (index 2)
    const actor = enc.combatants[enc.turn].id;
    enc = removeCombatant(enc, enc.combatants[0].id);
    expect(enc.combatants[enc.turn].id).toBe(actor);
    enc = removeCombatant(enc, actor);
    expect(enc.turn).toBe(0);
    expect(removeCombatant(enc, "nope")).toBe(enc);
  });

  it("damage uses temp hp first and never goes below zero; heal caps at max", () => {
    let enc = party();
    enc = setTempHp(enc, "c3", 5);
    enc = setTempHp(enc, "c3", 3);
    expect(byId(enc, "c3").tempHp).toBe(5);
    enc = damage(enc, "c3", 8);
    expect(byId(enc, "c3")).toMatchObject({ tempHp: 0, hp: 21 });
    expect(healthState(byId(enc, "c3"))).toBe("healthy");
    enc = damage(enc, "c3", 10);
    expect(healthState(byId(enc, "c3"))).toBe("bloodied");
    enc = damage(enc, "c3", 100);
    expect(byId(enc, "c3").hp).toBe(0);
    expect(healthState(byId(enc, "c3"))).toBe("down");
    enc = heal(enc, "c3", 100);
    expect(byId(enc, "c3").hp).toBe(24);
    expect(byId(damage(enc, "c3", Number.NaN), "c3").hp).toBe(24);
  });

  it("toggle removes an existing condition and caps the list", () => {
    let enc = party();
    enc = toggleCondition(enc, "c1", "Prone", null);
    enc = toggleCondition(enc, "c1", "Prone", null);
    expect(byId(enc, "c1").conditions).toEqual([]);
    for (let i = 0; i < 15; i++) enc = toggleCondition(enc, "c1", `Custom ${i}`, 2);
    expect(byId(enc, "c1").conditions).toHaveLength(12);
  });

  it("patch keeps values in range", () => {
    const enc = patchCombatant(party(), "c1", { maxHp: 5, hp: 50, ac: 99, name: "  " });
    expect(byId(enc, "c1")).toMatchObject({ maxHp: 5, hp: 5, ac: 40, name: "Goblin" });
  });

  it("schema enforces limits and shape", () => {
    const enc = party();
    expect(encounterSchema.safeParse(enc).success).toBe(true);
    const tooMany = { ...enc, combatants: Array.from({ length: 61 }, (_, i) => ({ ...enc.combatants[0], id: `x${i}` })) };
    expect(encounterSchema.safeParse(tooMany).success).toBe(false);
    expect(encounterSchema.safeParse({ ...enc, extra: 1 }).success).toBe(false);
    const badRef = { ...enc, combatants: [{ ...enc.combatants[0], ref: { source: "srd", edition: "2014", slug: "../x" } }] };
    expect(encounterSchema.safeParse(badRef).success).toBe(false);
  });
});
