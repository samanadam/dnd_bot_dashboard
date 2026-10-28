// Adds Wave Echo Cave (Lost Mine of Phandelver) to the portal database as one
// area: a prepared battle per room, the loot as item rewards tied to the room's
// battle, and the treasure that is not SRD gear as custom items. Hazards,
// obstacles and wandering monsters go in the area notes. Creatures outside the
// SRD (flameskull, spectator, Nezznar) are stored with a null ref.
//
//   node seed-wave-echo-cave.mjs <path/to/portal.db> [campaignId]
//
// Without a campaign id the area is filed under the only campaign the database
// already uses; with none or several, pass one (or "none" for unassigned).
// Refuses to run twice: it stops if an area with the same name exists.

import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

const AREA_NAME = "Wave Echo Cave";

const [path, campaignArg] = process.argv.slice(2);
if (!path) {
  console.error("usage: node seed-wave-echo-cave.mjs <portal.db> [campaignId|none]");
  process.exit(1);
}

// Stat lines (AC, HP, initiative bonus from DEX). `srd: false` marks creatures
// with no SRD entry, which get a null ref.
const SRD = {
  "ochre-jelly": { name: "Ochre Jelly", ac: 8, hp: 45, init: -2 },
  stirge: { name: "Stirge", ac: 14, hp: 2, init: 3 },
  skeleton: { name: "Skeleton", ac: 13, hp: 13, init: 2 },
  ghoul: { name: "Ghoul", ac: 12, hp: 22, init: 2 },
  bugbear: { name: "Bugbear", ac: 16, hp: 27, init: 2 },
  zombie: { name: "Zombie", ac: 8, hp: 22, init: -2 },
  wraith: { name: "Wraith", ac: 13, hp: 67, init: 3 },
  doppelganger: { name: "Doppelganger", ac: 14, hp: 52, init: 4 },
  "giant-spider": { name: "Giant Spider", ac: 14, hp: 26, init: 3 },
  flameskull: { name: "Flameskull", ac: 13, hp: 40, init: 3, srd: false },
  spectator: { name: "Spectator", ac: 14, hp: 39, init: 1, srd: false },
  nezznar: { name: "Nezznar the Black Spider", ac: 11, hp: 31, init: 1, srd: false },
};

// Treasure that is not in the SRD, kept as the DM's own items.
const CUSTOM = {
  cp: { name: "Copper Pieces", category: "Coins", costGp: 0.01, weightLb: 0.02, detail: "", description: "" },
  sp: { name: "Silver Pieces", category: "Coins", costGp: 0.1, weightLb: 0.02, detail: "", description: "" },
  ep: { name: "Electrum Pieces", category: "Coins", costGp: 0.5, weightLb: 0.02, detail: "", description: "" },
  gp: { name: "Gold Pieces", category: "Coins", costGp: 1, weightLb: 0.02, detail: "", description: "" },
  pp: { name: "Platinum Pieces", category: "Coins", costGp: 10, weightLb: 0.02, detail: "", description: "" },
  vitality: { name: "Potion of Vitality", category: "Potion", costGp: 0, weightLb: 0.5, detail: "", description: "Removes exhaustion and cures disease and poison. Healing dice give maximum HP for 24 hours." },
  lightbringer: { name: "Lightbringer", category: "Weapon", costGp: 0, weightLb: 4, detail: "+1 mace", description: "A +1 mace. Sheds light and deals extra radiant damage to undead." },
  dragonguard: { name: "Dragonguard", category: "Armor", costGp: 0, weightLb: 20, detail: "+1 breastplate", description: "A +1 breastplate." },
  platRing: { name: "Platinum Ring", category: "Art Object", costGp: 75, weightLb: 0, detail: "", description: "From the wizard's skeleton at the Dark Pool." },
  pipe: { name: "Ornate Pipe with Platinum", category: "Art Object", costGp: 150, weightLb: 1, detail: "", description: "From the Wizards' Quarters." },
  diamond: { name: "Diamond", category: "Gem", costGp: 100, weightLb: 0, detail: "", description: "" },
  gem10: { name: "Gem (10 gp)", category: "Gem", costGp: 10, weightLb: 0, detail: "", description: "From Nezznar's sack." },
  aleMug: { name: "Dwarven Ale Mug", category: "Art Object", costGp: 100, weightLb: 1, detail: "", description: "From the table in the Temple of Dumathoin." },
  mapBook: { name: "Book with a Map on the Cover", category: "Quest Item", costGp: 0, weightLb: 1, detail: "", description: "Found in the Wizards' Quarters." },
  spiderStaff: { name: "Spider Staff", category: "Staff", costGp: 0, weightLb: 4, detail: "", description: "Nezznar's staff." },
  key20: { name: "Key to the Priests' Quarters", category: "Quest Item", costGp: 0, weightLb: 0, detail: "", description: "Opens the locked door to Area 20." },
};

const srdItem = (slug) => ({ source: "srd", edition: "2014", slug });
const custom = (key) => ({ custom: key });
const item = (ref, quantity = 1, note = "") => ({ ref, quantity, note });
// A creature: key into SRD, count, and an optional name/HP/notes override for a named one.
const foe = (slug, count = 1, override = {}) => ({ slug, count, ...override });

const ROOMS = [
  {
    name: "Cave Entrance (Area 1)",
    foes: [],
    items: [item(srdItem("boots-of-striding-and-springing"), 1, "On Tharden Rockseeker's body")],
  },
  { name: "Mine Tunnels (Area 2)", foes: [foe("ochre-jelly")], items: [] },
  { name: "Old Entrance (Area 3)", foes: [foe("stirge", 10)], items: [] },
  { name: "Old Guardroom (Area 4)", foes: [foe("skeleton", 9)], items: [] },
  {
    name: "Assayers' Office (Area 5)",
    foes: [],
    items: [
      item(custom("cp"), 600, "Locked chest (DC 20 Dexterity)"),
      item(custom("sp"), 180, "Locked chest (DC 20 Dexterity)"),
      item(custom("ep"), 90, "Locked chest (DC 20 Dexterity)"),
      item(custom("gp"), 60, "Locked chest (DC 20 Dexterity)"),
    ],
  },
  { name: "South Barracks (Area 6)", foes: [foe("ghoul", 3)], items: [] },
  { name: "Great Cavern (Area 9)", foes: [foe("ghoul", 7)], items: [] },
  {
    name: "Dark Pool (Area 10)",
    foes: [],
    items: [
      item(custom("platRing"), 2, "On the wizard's skeleton"),
      item(srdItem("wand-of-magic-missiles"), 1, "On the wizard's skeleton"),
    ],
  },
  {
    name: "North Barracks (Area 11)",
    foes: [foe("bugbear", 5)],
    items: [
      item(custom("cp"), 15, "Pouch"),
      item(custom("ep"), 13, "Pouch"),
      item(custom("vitality"), 1, "Pouch"),
    ],
  },
  { name: "Smelter Cavern (Area 12)", foes: [foe("zombie", 8), foe("flameskull")], items: [] },
  {
    name: "Wizards' Quarters (Area 14)",
    foes: [foe("wraith", 1, { name: "Mormesk", kind: "npc", notes: "Wraith. Will bargain; wants the spectator dead." })],
    items: [
      item(custom("pipe")),
      item(custom("cp"), 1100),
      item(custom("sp"), 160),
      item(custom("ep"), 50),
      item(custom("diamond"), 3),
      item(custom("mapBook")),
    ],
  },
  {
    name: "Forge of Spells (Area 15)",
    foes: [foe("spectator", 1, { notes: "Forge guardian." })],
    items: [item(custom("lightbringer")), item(custom("dragonguard"))],
  },
  {
    name: "Collapsed Cavern (Area 18)",
    foes: [foe("bugbear", 3), foe("doppelganger", 1, { name: "Vhalak", kind: "npc", notes: "Doppelganger disguised as a drow." })],
    items: [item(srdItem("gauntlets-of-ogre-power"), 1, "DC 20 Wisdom to find")],
  },
  {
    name: "Temple of Dumathoin (Area 19)",
    foes: [foe("nezznar", 1, { kind: "npc", notes: "Drow. Carries the key to Area 20." }), foe("giant-spider", 4)],
    items: [
      item(custom("spiderStaff"), 1, "On Nezznar"),
      item(srdItem("potion-of-healing"), 1, "On Nezznar"),
      item(custom("key20"), 1, "On Nezznar"),
      item(custom("ep"), 190, "Sack on the table"),
      item(custom("gp"), 130, "Sack on the table"),
      item(custom("pp"), 15, "Sack on the table"),
      item(custom("gem10"), 9, "Sack on the table"),
      item(custom("aleMug"), 1, "Sack on the table"),
    ],
  },
];

const SUMMARY = "The lost mine of the Phandelver Pact and the Forge of Spells. Nundro Rockseeker is held in the Priests' Quarters (Area 20).";
const NOTES = [
  "Empty: Ruined Storeroom (7), Starry Cavern (13), Booming Cavern (16), Old Streambed (17).",
  "Cave Entrance (1): 20 ft pit, DC 15 Strength to climb.",
  "Fungi Cavern (8): poison gas, DC 11 Constitution save or 3d6 damage and poisoned for 10 minutes.",
  "North Barracks (11): east door barred, DC 20 Strength to force.",
  "Forge of Spells (15): the Forge of Spells, a brazier of green flame.",
  "Collapsed Cavern (18): 20 ft rift, DC 10 Strength to climb.",
  "Temple of Dumathoin (19): prying out the statue's emerald eyes causes a cave-in.",
  "Priests' Quarters (20): locked door, DC 15 Dexterity to pick, or use Nezznar's key. Noise alerts Area 19. Prisoner: Nundro Rockseeker.",
  "Wandering monsters (d12): 1-3 2d4 stirges; 4-5 1d4 ghouls; 6 1d4 gricks; 7-8 1d4 bugbears; 9 1d6 skeletons; 10 1d6 zombies; 11-12 1 ochre jelly.",
].join("\n");

const db = new DatabaseSync(path);
db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

const hasAreas = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'area_rewards'").get();
if (!hasAreas) {
  console.error("This database has no areas tables yet. Start the portal once so it migrates, then run this again.");
  process.exit(1);
}
if (db.prepare("SELECT 1 FROM areas WHERE name = ?").get(AREA_NAME)) {
  console.error(`An area named "${AREA_NAME}" already exists. Delete it first to seed again.`);
  process.exit(1);
}

function pickCampaign() {
  if (campaignArg === "none") return null;
  if (campaignArg) return campaignArg;
  const used = db
    .prepare(
      "SELECT campaign_id FROM encounters WHERE campaign_id IS NOT NULL UNION SELECT campaign_id FROM creatures WHERE campaign_id IS NOT NULL UNION SELECT campaign_id FROM areas WHERE campaign_id IS NOT NULL",
    )
    .all()
    .map((row) => row.campaign_id);
  if (used.length === 1) return used[0];
  console.error(used.length ? `Several campaigns in use, pass one of: ${used.join(", ")}` : 'No campaign in use yet; pass a campaign id, or "none".');
  process.exit(1);
}

const campaignId = pickCampaign();
const at = new Date().toISOString();
let combatantSeq = 0;
const combatantId = () => `c${Date.now().toString(36)}${(combatantSeq++).toString(36)}`;

function combatants(foes) {
  const out = [];
  const taken = new Set();
  for (const f of foes) {
    const base = SRD[f.slug];
    for (let i = 0; i < f.count; i++) {
      const root = f.name ?? base.name;
      let name = root;
      for (let n = 2; taken.has(name); n++) name = `${root} ${n}`;
      taken.add(name);
      const hp = f.hp ?? base.hp;
      out.push({
        id: combatantId(),
        name,
        kind: f.kind ?? "monster",
        ref: base.srd === false ? null : { source: "srd", edition: "2014", slug: f.slug },
        initiative: null,
        initiativeBonus: base.init,
        ac: base.ac,
        hp,
        maxHp: hp,
        tempHp: 0,
        conditions: [],
        concentration: false,
        friendly: false,
        notes: f.notes ?? "",
      });
    }
  }
  return out;
}

db.exec("BEGIN IMMEDIATE");
try {
  const customIds = {};
  const insertItem = db.prepare("INSERT INTO items (id, name, campaign_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
  for (const [key, { name, ...rest }] of Object.entries(CUSTOM)) {
    const id = randomUUID();
    insertItem.run(id, name, campaignId, JSON.stringify({ category: rest.category, rarity: "", attunement: "", costGp: rest.costGp, weightLb: rest.weightLb, detail: rest.detail, description: rest.description }), at, at);
    customIds[key] = id;
  }

  const { next } = db
    .prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS next FROM areas WHERE ${campaignId === null ? "campaign_id IS NULL" : "campaign_id = ?"}`)
    .get(...(campaignId === null ? [] : [campaignId]));
  const areaId = randomUUID();
  db.prepare("INSERT INTO areas (id, campaign_id, name, summary, notes, position, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)").run(
    areaId, campaignId, AREA_NAME, SUMMARY, NOTES, Number(next), at, at,
  );

  const insertEncounter = db.prepare(
    "INSERT INTO encounters (id, name, version, data, campaign_id, kind, created_at, updated_at) VALUES (?, ?, 1, ?, ?, 'prepared', ?, ?)",
  );
  const linkEncounter = db.prepare("INSERT INTO area_encounters (area_id, encounter_id, position) VALUES (?, ?, ?)");
  const insertReward = db.prepare(
    "INSERT INTO area_rewards (id, area_id, encounter_id, kind, status, position, ref_key, data) VALUES (?, ?, ?, 'item', 'planned', ?, ?, ?)",
  );

  let battlePos = 0;
  let rewardPos = 0;
  for (const room of ROOMS) {
    let encounterId = null;
    if (room.foes.length || room.items.length) {
      encounterId = randomUUID();
      const encounter = { name: room.name, round: 0, turn: 0, combatants: combatants(room.foes) };
      insertEncounter.run(encounterId, room.name, JSON.stringify(encounter), campaignId, at, at);
      linkEncounter.run(areaId, encounterId, battlePos++);
    }
    for (const reward of room.items) {
      const ref = reward.ref.custom ? { source: "custom", id: customIds[reward.ref.custom] } : reward.ref;
      const refKey = ref.source === "srd" ? `srd:${ref.edition}/${ref.slug}` : `custom:${ref.id}`;

      const note = reward.note;
      insertReward.run(randomUUID(), areaId, encounterId, rewardPos++, refKey, JSON.stringify({ itemRef: ref, quantity: reward.quantity, note }));
    }
  }
  db.exec("COMMIT");
  console.log(`Added "${AREA_NAME}" (${areaId}) with ${battlePos} battles and ${rewardPos} rewards, campaign ${campaignId ?? "unassigned"}.`);
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
