import { newBody, sheetBodySchema, type SheetBody } from "@/lib/sheets/body";
import { derive } from "@/lib/sheets/derive";
import type { StoredSheet } from "@/lib/sheets/repo";
import { newVitals } from "@/lib/sheets/vitals";

// Two made-up characters for the demo: a single-class wizard, and a
// paladin/warlock with a familiar. Demo ids only; nothing here is real.

export const DEMO_PLAYER = "000000000000000000";
export const DEMO_SHEET_WIZARD = "5e7a0000-0000-4000-8000-000000000001";
export const DEMO_SHEET_PALADIN = "5e7a0000-0000-4000-8000-000000000002";

function wizard(): SheetBody {
  const b = newBody("Ilsa Thornwick");
  b.identity = { ...b.identity, species: "Elf", background: "Sage", alignment: "Neutral good", pronouns: "she/her", age: "112", eyes: "Grey" };
  b.classes = [{ id: "w", name: "Wizard", subclass: "Evoker", level: 5, hitDie: 6, caster: "full", spellAbility: "int", preparedMax: null, saveProficiencies: ["int", "wis"] }];
  for (const [a, s] of Object.entries({ str: 8, dex: 14, con: 13, int: 17, wis: 12, cha: 10 })) b.abilities[a as keyof SheetBody["abilities"]].base = s;
  b.abilities.int.bonus = 1;
  b.proficiencies.skills = { ...b.proficiencies.skills, arcana: "proficient", history: "proficient", investigation: "proficient", perception: "proficient" };
  b.proficiencies.languages = ["Common", "Elvish", "Draconic"];
  b.combat.ac = { mode: "unarmored", extra: null, bonus: 0 };
  b.combat.attacks = [
    { id: "dag", name: "Dagger", ability: "best-str-dex", proficient: true, toHitBonus: 0, damage: [{ roll: "1d4", type: "piercing", addAbility: true }], range: "20/60 ft", properties: "Finesse, light, thrown", notes: "", itemId: "i1" },
  ];
  b.features = [
    { id: "f1", name: "Arcane Recovery", source: "Wizard 1", description: "Once a day after a short rest, regain spell slots totalling up to half your wizard level.", resourceId: "ar" },
    { id: "f2", name: "Sculpt Spells", source: "Evoker 2", description: "Allies caught in your evocations can be spared.", resourceId: null },
  ];
  b.resources = [{ id: "ar", name: "Arcane Recovery", max: 1, reset: "long", resetAmount: "all" }];
  b.spellcasting.entries = [
    { id: "s1", ref: { source: "srd", edition: "2024", slug: "fire-bolt" }, classId: "w", status: "known", notes: "" },
    { id: "s2", ref: { source: "srd", edition: "2024", slug: "magic-missile" }, classId: "w", status: "prepared", notes: "" },
    { id: "s3", ref: { source: "srd", edition: "2024", slug: "shield" }, classId: "w", status: "prepared", notes: "" },
    { id: "s4", ref: { source: "srd", edition: "2024", slug: "misty-step" }, classId: "w", status: "prepared", notes: "" },
    { id: "s5", ref: { source: "srd", edition: "2024", slug: "fireball" }, classId: "w", status: "prepared", notes: "" },
    { id: "s6", ref: { source: "srd", edition: "2024", slug: "detect-magic" }, classId: "w", status: "known", notes: "" },
  ];
  b.inventory.items = [
    { id: "i1", name: "Dagger", ref: null, qty: 1, weightLb: 1, equipped: true, attuned: false, container: "", notes: "" },
    { id: "i2", name: "Spellbook", ref: null, qty: 1, weightLb: 3, equipped: false, attuned: false, container: "Backpack", notes: "Bound in blue leather" },
    { id: "i3", name: "Drowned Lantern", ref: null, qty: 1, weightLb: 2, equipped: true, attuned: true, container: "", notes: "Bright light 30 ft, even under water" },
  ];
  b.inventory.currency = { cp: 14, sp: 32, ep: 0, gp: 61, pp: 2 };
  b.backstory = {
    ...b.backstory,
    personalityTraits: "Takes notes on everything, including other people's conversations.",
    ideals: "Knowledge should be shared, not hoarded.",
    bonds: "Her old master vanished in the Ashen Guild's archive.",
    flaws: "Cannot leave a locked door alone.",
    backstory: "Ilsa left the tower at Velmar after her master disappeared, following a trail of burned letters to the lake towns.",
  };
  return sheetBodySchema.parse(b);
}

function paladin(): SheetBody {
  const b = newBody("Bram Ashford");
  b.identity = { ...b.identity, species: "Human", background: "Soldier", alignment: "Lawful neutral", pronouns: "he/him" };
  b.classes = [
    { id: "p", name: "Paladin", subclass: "Oath of Devotion", level: 4, hitDie: 10, caster: "half", spellAbility: "cha", preparedMax: null, saveProficiencies: ["wis", "cha"] },
    { id: "k", name: "Warlock", subclass: "Fiend", level: 2, hitDie: 8, caster: "pact", spellAbility: "cha", preparedMax: null, saveProficiencies: ["wis", "cha"] },
  ];
  for (const [a, s] of Object.entries({ str: 16, dex: 10, con: 14, int: 8, wis: 10, cha: 16 })) b.abilities[a as keyof SheetBody["abilities"]].base = s;
  b.proficiencies.skills = { ...b.proficiencies.skills, athletics: "proficient", intimidation: "proficient", persuasion: "proficient" };
  b.combat.ac = { mode: "armor", base: 16, dexCap: 0, shield: true, bonus: 0 };
  b.combat.attacks = [
    { id: "ls", name: "Longsword", ability: "str", proficient: true, toHitBonus: 0, damage: [{ roll: "1d8", type: "slashing", addAbility: true }], range: "", properties: "Versatile", notes: "", itemId: null },
  ];
  b.resources = [
    { id: "loh", name: "Lay on Hands", max: 20, reset: "long", resetAmount: "all" },
    { id: "cd", name: "Channel Divinity", max: 1, reset: "short", resetAmount: "all" },
  ];
  b.spellcasting.entries = [
    { id: "s1", ref: { source: "srd", edition: "2024", slug: "bless" }, classId: "p", status: "prepared", notes: "" },
    { id: "s2", ref: { source: "srd", edition: "2024", slug: "cure-wounds" }, classId: "p", status: "prepared", notes: "" },
    { id: "s3", ref: { source: "srd", edition: "2024", slug: "eldritch-blast" }, classId: "k", status: "known", notes: "" },
  ];
  b.companions = [{ id: "imp", name: "Sootling", kind: "familiar", ref: null, ac: 13, maxHp: 10, speed: "20 ft, fly 40 ft", attacks: [{ name: "Sting", toHit: 5, damage: "1d4+3" }], notes: "An imp who insists it is a cat." }];
  return sheetBodySchema.parse(b);
}

export function demoSheets(now: number, campaignId: string): StoredSheet[] {
  const at = new Date(now - 86_400_000).toISOString();
  const make = (id: string, body: SheetBody, active: boolean): StoredSheet => {
    const maxHp = derive(body, newVitals(1), "2024").maxHp;
    return {
      id,
      campaignId,
      ownerUserId: DEMO_PLAYER,
      name: body.identity.name,
      edition: "2024",
      status: "active",
      active,
      version: 1,
      body,
      vitalsVersion: 1,
      vitals: { ...newVitals(maxHp), hp: Math.max(1, maxHp - 6), slotsSpent: [1, 0, 0, 0, 0, 0, 0, 0, 0] },
      dmNotes: "The master is alive, in the Guild's lowest vault.",
      portrait: null,
      nameSync: "ok",
      createdAt: at,
      updatedAt: at,
    };
  };
  return [make(DEMO_SHEET_WIZARD, wizard(), true), make(DEMO_SHEET_PALADIN, paladin(), false)];
}
