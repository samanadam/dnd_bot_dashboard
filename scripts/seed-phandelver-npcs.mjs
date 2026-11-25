// Adds the Magic Forge of Phandelver NPCs to the portal database as the DM's own
// NPCs: the people met so far and the six members of the Veiled Lantern guild.
// Stat lines are placeholders built from the class and level each description
// gives (or a commoner when it gives none); the descriptions go in the notes.
//
//   node seed-phandelver-npcs.mjs <path/to/portal.db> <campaignId|none>
//
// An NPC whose name already exists in that campaign is skipped, so it is safe to
// run again.

import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

const [path, campaignArg] = process.argv.slice(2);
if (!path || !campaignArg) {
  console.error("usage: node seed-phandelver-npcs.mjs <portal.db> <campaignId|none>");
  process.exit(1);
}
const campaignId = campaignArg === "none" ? null : campaignArg;

const XP = { "0": 10, "1/8": 25, "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700, "6": 2300 };

// A stat block from the few numbers that differ between these NPCs.
function block({ name, size = "Medium", type = "Humanoid (human)", alignment = "unaligned", ac, acNote = "", hp, hitDice = "", abilities = {}, cr = "0", languages = "Common", senses = "passive Perception 10", speed = "30 ft.", traits = [], actions = [] }) {
  return {
    name,
    size,
    type,
    alignment,
    ac,
    acNote,
    hp,
    hitDice,
    speed,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...abilities },
    saves: {},
    skills: {},
    senses,
    languages,
    cr,
    xp: XP[cr],
    damageVulnerabilities: "",
    damageResistances: "",
    damageImmunities: "",
    conditionImmunities: "",
    traits,
    actions,
    bonusActions: [],
    reactions: [],
    legendaryActions: [],
    legendaryDescription: "",
  };
}

const strike = (name, toHit, damage, damageType, desc) => ({ name, desc, attack: { toHit, damage, damageType } });
const melee = (name, toHit, damage, damageType) => strike(name, toHit, damage, damageType, `Melee weapon attack, ${toHit >= 0 ? "+" : ""}${toHit} to hit, reach 5 ft. Hit: ${damage} ${damageType} damage.`);
const ranged = (name, toHit, damage, damageType, range) => strike(name, toHit, damage, damageType, `Ranged weapon attack, ${toHit >= 0 ? "+" : ""}${toHit} to hit, range ${range}. Hit: ${damage} ${damageType} damage.`);

const PLACEHOLDER = "Stat line is a placeholder; adjust it.";

const NPCS = [
  {
    stats: block({ name: "Gündar Rocksinger", type: "Humanoid (dwarf)", ac: 10, hp: 9, hitDice: "2d8", abilities: { str: 12, con: 14 }, languages: "Common, Dwarvish", senses: "darkvision 60 ft., passive Perception 10", speed: "25 ft.", actions: [melee("Pickaxe", 3, "1d6+1", "piercing")] }),
    tags: ["Phandalin", "Quest"],
    notes: "Miner who hired the party for the Magic Forge job. Kidnapped with Sildar, found comatose in the forest castle.\nA second, near-identical dwarf was found unconscious beside him.",
  },
  {
    stats: block({ name: "Dwarf (Gündar's double)", type: "Humanoid (dwarf)", ac: 10, hp: 9, hitDice: "2d8", abilities: { str: 12, con: 14 }, languages: "Common, Dwarvish", senses: "darkvision 60 ft., passive Perception 10", speed: "25 ft.", actions: [melee("Pickaxe", 3, "1d6+1", "piercing")] }),
    tags: ["Phandalin", "Mystery"],
    notes: "Second unconscious dwarf found beside Gündar in the castle. Near-identical to him. Name unknown.",
  },
  {
    stats: block({ name: "Sildar Havrintir", alignment: "lawful good", ac: 16, acNote: "chain mail", hp: 27, hitDice: "5d8+5", abilities: { str: 13, dex: 10, con: 12, int: 10, wis: 11, cha: 10 }, cr: "1", senses: "passive Perception 10", actions: [melee("Longsword", 3, "1d8+1", "slashing")] }),
    tags: ["Phandalin", "Lord's Alliance"],
    notes: "White-haired Lord's Alliance lord, rescued from the goblins. Paid the party 40 gp each to find Gündar.\nYarno is his old friend and former student.",
  },
  {
    stats: block({ name: "Vali", alignment: "neutral evil", ac: 11, hp: 30, hitDice: "4d8+12", abilities: { str: 20, dex: 10, con: 16, int: 8, wis: 8, cha: 10 }, cr: "2", actions: [melee("Slam", 7, "2d8+5", "bludgeoning")] }),
    tags: ["Phandalin", "Mystery"],
    notes: "Fat, self-declared town governor, useless and sidelined by Yarno.\nLater showed up in the castle as an inhumanly strong, blue-blooded thing that melted when hit by Magic Missile.",
  },
  {
    stats: block({ name: "Yarno", alignment: "lawful neutral", ac: 16, acNote: "chain mail", hp: 39, hitDice: "6d8+12", abilities: { str: 15, dex: 12, con: 14, int: 10, wis: 12, cha: 12 }, cr: "2", actions: [melee("Longsword", 4, "1d8+2", "slashing")] }),
    tags: ["Phandalin", "Red Guard"],
    notes: "Red Guard commander, Sildar's old friend and student. Blames Zenith for the raids and now runs the town's defense.",
  },
  {
    stats: block({ name: "Heki", ac: 10, hp: 4, hitDice: "1d8", cr: "0", actions: [melee("Club", 2, "1d4", "bludgeoning")] }),
    tags: ["Phandalin", "Quest"],
    notes: "Tall, thin local, Gündar's former partner. Explained the town and Forge history and paid 10 gp each.",
  },
  {
    stats: block({ name: "Puku", size: "Small", type: "Humanoid (goblinoid)", alignment: "neutral evil", ac: 15, acNote: "leather armor, shield", hp: 7, hitDice: "2d6", abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 }, cr: "1/4", languages: "Common, Goblin", senses: "darkvision 60 ft., passive Perception 9", speed: "30 ft.", traits: [{ name: "Nimble Escape", desc: "Can take the Disengage or Hide action as a bonus action on each of its turns." }], actions: [melee("Scimitar", 4, "1d6+2", "slashing")] }),
    tags: ["Goblins"],
    notes: "Small, frightened goblin prisoner in the camp. Defected to \"Master Yimik\" and was burned in Sam's flame while fleeing.",
  },
  {
    stats: block({ name: "Yimik", size: "Small", type: "Humanoid (goblinoid)", alignment: "neutral evil", ac: 17, acNote: "chain shirt, shield", hp: 21, hitDice: "6d6", abilities: { str: 10, dex: 14, con: 10, int: 10, wis: 8, cha: 10 }, cr: "1", languages: "Common, Goblin", senses: "darkvision 60 ft., passive Perception 9", speed: "30 ft.", traits: [{ name: "Nimble Escape", desc: "Can take the Disengage or Hide action as a bonus action on each of its turns." }], actions: [melee("Scimitar", 4, "1d6+2", "slashing")] }),
    tags: ["Goblins"],
    notes: "Big goblin with two gold teeth and an iron key. Negotiated the party's passage at the goblin gate. \"Master\" of the goblin revolution.",
  },
  {
    stats: block({ name: "Hukuku", size: "Small", type: "Humanoid (goblinoid)", alignment: "neutral evil", ac: 15, acNote: "leather armor, shield", hp: 7, hitDice: "2d6", abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 }, cr: "1/4", languages: "Common, Goblin", senses: "darkvision 60 ft., passive Perception 9", speed: "30 ft.", traits: [{ name: "Nimble Escape", desc: "Can take the Disengage or Hide action as a bonus action on each of its turns." }], actions: [melee("Scimitar", 4, "1d6+2", "slashing"), ranged("Shortbow", 4, "1d6+2", "piercing", "80/320 ft.")] }),
    tags: ["Goblins", "Mystery"],
    notes: "Goblin the party tied to a tree. Gone by morning, rope cut, a black-feathered arrow left in an apple.",
  },
  {
    stats: block({ name: "The Wizard", alignment: "neutral evil", ac: 12, acNote: "15 with mage armor", hp: 40, hitDice: "9d8", abilities: { dex: 14, con: 11, int: 17, wis: 12, cha: 11 }, cr: "6", languages: "Common plus three more", senses: "passive Perception 11", traits: [{ name: "Spellcasting", desc: "Casts as a 9th-level wizard (spell save DC 14, +6 to hit with spell attacks). Use the SRD mage's spell list." }], actions: [melee("Dagger", 5, "1d4+2", "piercing")] }),
    tags: ["Tower camp", "Mystery"],
    notes: "Gaunt wizard at the tower camp, stirring purple gas. Commands grey zombies. Threw the cursed rune that stranded the party.",
  },
  {
    stats: block({ name: "One-eyed creature", size: "Medium", type: "Aberration", alignment: "neutral", ac: 15, acNote: "natural armor", hp: 39, hitDice: "6d8+12", abilities: { str: 12, dex: 12, con: 14, int: 17, wis: 14, cha: 14 }, cr: "3", languages: "Telepathy 120 ft.", senses: "darkvision 60 ft., passive Perception 12", traits: [{ name: "Telepathy", desc: "Speaks directly into the minds of creatures within 120 feet." }], actions: [melee("Claw", 4, "2d6+1", "slashing")] }),
    tags: ["Chasm"],
    notes: "One-eyed, lidless humanoid beyond the chasm. Speaks in minds. Trades passage for meat and magic items; holds a tribute deal.",
  },
  {
    stats: block({ name: "Sister Garaele", type: "Humanoid (elf)", alignment: "neutral good", ac: 13, acNote: "chain shirt", hp: 27, hitDice: "5d8+5", abilities: { str: 10, dex: 10, con: 12, int: 13, wis: 16, cha: 13 }, cr: "2", languages: "Common, Elvish", senses: "darkvision 60 ft., passive Perception 13", traits: [{ name: "Fey Ancestry", desc: "Advantage on saves against being charmed; magic can't put her to sleep." }, { name: "Spellcasting", desc: "Casts as a 5th-level cleric (spell save DC 13, +5 to hit with spell attacks). Use the SRD priest's spell list." }], actions: [melee("Mace", 2, "1d6", "bludgeoning")] }),
    tags: ["Temple"],
    notes: "Long-haired elf priest at the temple, beaten by a \"widow spirit\".\nTasked Ethan with returning a hairclip and finding Agartha's book.",
  },
  {
    stats: block({ name: "Elara", alignment: "neutral good", ac: 16, acNote: "chain mail, shield", hp: 17, hitDice: "2d8+4", abilities: { str: 12, dex: 10, con: 14, int: 11, wis: 16, cha: 13 }, cr: "1/2", languages: "Common", senses: "passive Perception 13", traits: [{ name: "Spellcasting", desc: "Casts as a 2nd-level cleric (spell save DC 13, +5 to hit with spell attacks). Cure Wounds, Healing Word, Bless, Sanctuary." }], actions: [melee("Mace", 3, "1d6+1", "bludgeoning")] }),
    tags: ["Temple", "Veiled Lantern"],
    notes: [
      "Cleric 2, about 40. Senior cleric and moral center of the Veiled Lantern. White-haired non-elf, the woman with the green ring. Was healing Sister Garaele at the temple, claims the Green Ring guild and warns Ethan to stay quiet.",
      "She and her children were once in serious financial trouble. Valen gave them shelter, support and a chance to rebuild. She stays loyal because she remembers his kindness, not because he controls her.",
      "Compassionate, practical, emotionally perceptive. Leads the guild's charitable and religious work. Knows Valen hides behind disguises but recognizes the person beneath them.",
      "Signature item idea: Mother's Prayer Beads, a keepsake for the people she has prayed for and the lives the guild has helped.",
      "Children: Liora and Kael.",
    ].join("\n"),
  },
  {
    stats: block({ name: "Valen Veyr", alignment: "neutral good", ac: 12, acNote: "15 with mage armor", hp: 18, hitDice: "3d6+3", abilities: { str: 9, dex: 14, con: 12, int: 16, wis: 13, cha: 14 }, cr: "1", languages: "Common, Elvish, Draconic", senses: "passive Perception 14", traits: [{ name: "Spellcasting", desc: "Casts as a 3rd-level wizard, School of Illusion (spell save DC 13, +5 to hit with spell attacks). Disguise Self, Mage Armor, Magic Missile, Silent Image, Invisibility." }], actions: [melee("Dagger", 4, "1d4+2", "piercing")] }),
    tags: ["Veiled Lantern"],
    notes: [
      "Age 24. Wizard 3, School of Illusion. Founder and guildmaster of the Veiled Lantern, a small guild and charitable temple that helps ordinary people with healing, shelter, food, protection and adventuring services.",
      "A fallen noble who took up magic out of curiosity and a desire for knowledge. His experiences taught him that trust and identity are dangerous, so he learned to conceal himself.",
      "Uses disguises almost every day, even inside his own guild. Only a handful of people know his true appearance. Intelligent, observant, cautious, hard to deceive. Genuinely helps people, but will manipulate others to get something important to him. Wants knowledge, not power for its own sake.",
      "Central flaw: he knows how to protect himself but struggles to let people get close.",
    ].join("\n"),
  },
  {
    stats: block({ name: "Garrick", alignment: "lawful good", ac: 16, acNote: "chain mail", hp: 22, hitDice: "2d10+6", abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 10 }, cr: "1", senses: "passive Perception 11", traits: [{ name: "Second Wind", desc: "Bonus action: regain 1d10+2 hit points. Once per short or long rest." }], actions: [melee("Longsword", 5, "1d8+3", "slashing")] }),
    tags: ["Veiled Lantern"],
    notes: "Age about 30. Fighter 2. Valen's personal bodyguard, a former guard of Valen's noble family who stayed loyal after its fall.\nSerious, practical, protective, dependable. One of the few who know Valen's real identity, has likely known him since childhood and recognizes his disguises. Often disapproves of Valen's risky plans but stays loyal.\nA protective older-brother figure who can challenge Valen without fear.",
  },
  {
    stats: block({ name: "Mira", alignment: "neutral good", ac: 14, acNote: "studded leather", hp: 19, hitDice: "3d8+3", abilities: { str: 11, dex: 16, con: 12, int: 12, wis: 14, cha: 10 }, cr: "1/2", languages: "Common, Elvish", senses: "passive Perception 14", traits: [{ name: "Favored Enemy", desc: "Advantage on Wisdom (Survival) checks to track, and Intelligence checks to recall information about, her chosen enemy type." }], actions: [melee("Shortsword", 5, "1d6+3", "piercing"), ranged("Longbow", 5, "1d8+3", "piercing", "150/600 ft.")] }),
    tags: ["Veiled Lantern"],
    notes: "Age 25 to 35. Ranger 2. Administrator, scout and expedition coordinator, a practical former ranger who keeps the guild running: contracts, finances, supplies, maps, scouting and expedition planning.\nCompetent, organized, grounded. Doesn't blindly follow Valen. Values preparation over improvisation. One of the few who know Valen's real identity.\nShe makes his plans workable and tells him when they are foolish.",
  },
  {
    stats: block({ name: "Liora", alignment: "neutral good", ac: 14, acNote: "scale mail", hp: 9, hitDice: "1d8+1", abilities: { str: 10, dex: 12, con: 12, int: 10, wis: 15, cha: 13 }, cr: "1/8", senses: "passive Perception 12", traits: [{ name: "Spellcasting", desc: "Casts as a 1st-level cleric (spell save DC 12, +4 to hit with spell attacks). Cure Wounds, Healing Word, Bless." }], actions: [melee("Mace", 2, "1d6", "bludgeoning")] }),
    tags: ["Veiled Lantern"],
    notes: "Age 21 to 23. Cleric 1. Junior healer, Elara's daughter. Helps at the temple and sometimes joins expeditions.\nKind, optimistic, protective of her younger brother, more adventurous than her mother. Believes in the guild's mission and appreciates Valen for helping her family. Still developing her healing and field skills.\nRelationship with Kael: a caring older sister who wants him to grow but worries when he takes needless risks.",
  },
  {
    stats: block({ name: "Kael", alignment: "chaotic good", ac: 12, acNote: "mage armor adds Dex", hp: 8, hitDice: "1d6+2", abilities: { str: 8, dex: 14, con: 14, int: 12, wis: 10, cha: 16 }, cr: "1/8", senses: "passive Perception 10", traits: [{ name: "Spellcasting", desc: "Casts as a 1st-level sorcerer (spell save DC 13, +5 to hit with spell attacks). Fire Bolt, Mage Hand, Magic Missile, Shield." }], actions: [melee("Dagger", 2, "1d4", "piercing")] }),
    tags: ["Veiled Lantern"],
    notes: "Age 17. Sorcerer 1. Young magical apprentice, Elara's son. Has innate magical talent that Valen recognized and encouraged.\nEnthusiastic, curious, sometimes reckless. Wants to understand his powers; still learning to control them. Sometimes clashes with his protective sister.\nAdmires Valen as a mentor and older-brother figure, perhaps without understanding how much Valen conceals.",
  },
];

const db = new DatabaseSync(path);
db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
const exists = db.prepare(`SELECT 1 FROM creatures WHERE name = ? AND ${campaignId === null ? "campaign_id IS NULL" : "campaign_id = ?"}`);
const insert = db.prepare("INSERT INTO creatures (id, kind, name, data, campaign_id, created_at, updated_at) VALUES (?, 'npc', ?, ?, ?, ?, ?)");
const at = new Date().toISOString();

db.exec("BEGIN IMMEDIATE");
try {
  let added = 0;
  for (const { stats, tags, notes } of NPCS) {
    if (exists.get(stats.name, ...(campaignId === null ? [] : [campaignId]))) {
      console.log(`skip ${stats.name} (already there)`);
      continue;
    }
    const data = { statBlock: stats, notes: `${notes}\n\n${PLACEHOLDER}`, tags };
    insert.run(randomUUID(), stats.name, JSON.stringify(data), campaignId, at, at);
    added++;
  }
  db.exec("COMMIT");
  console.log(`Added ${added} NPCs, campaign ${campaignId ?? "unassigned"}.`);
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
