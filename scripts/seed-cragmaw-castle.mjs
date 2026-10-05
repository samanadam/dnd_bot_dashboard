// Adds Cragmaw Castle (Lost Mine of Phandelver) to the portal database as one
// area: a prepared battle per room, the loot as item rewards tied to the room's
// battle, and the treasure that is not SRD gear as custom items.
//
//   node seed-cragmaw-castle.mjs <path/to/portal.db> [campaignId]
//
// Without a campaign id the area is filed under the only campaign the database
// already uses; with none or several, pass one (or "none" for unassigned).
// Refuses to run twice: it stops if an area with the same name exists.

import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

const AREA_NAME = "Cragmaw Castle";

const [path, campaignArg] = process.argv.slice(2);
if (!path) {
  console.error("usage: node seed-cragmaw-castle.mjs <portal.db> [campaignId|none]");
  process.exit(1);
}

// SRD 2014 stat lines (AC, HP, initiative bonus from DEX).
const SRD = {
  goblin: { name: "Goblin", ac: 15, hp: 7, init: 2 },
  hobgoblin: { name: "Hobgoblin", ac: 18, hp: 11, init: 1 },
  grick: { name: "Grick", ac: 14, hp: 27, init: 2 },
  owlbear: { name: "Owlbear", ac: 13, hp: 59, init: 1 },
  bugbear: { name: "Bugbear", ac: 16, hp: 27, init: 2 },
  wolf: { name: "Wolf", ac: 13, hp: 11, init: 2 },
  doppelganger: { name: "Doppelganger", ac: 14, hp: 52, init: 4 },
};

// Treasure that is not in the SRD, kept as the DM's own items.
const CUSTOM = {
  brandy: { name: "Cask of Dwarven Brandy", category: "Trade Good", costGp: 0, weightLb: 0, detail: "", description: "A small cask of fine dwarven brandy." },
  sildarGear: { name: "Sildar's Armor and Sword", category: "Gear", costGp: 0, weightLb: 0, detail: "Chain mail and longsword", description: "Sildar Hallwinter's confiscated chain mail and longsword. Return them to him." },
  staff: { name: "Fine Staff", category: "Treasure", costGp: 10, weightLb: 4, detail: "", description: "A well-crafted staff on the hobgoblins' weapon rack." },
  statue: { name: "Gold Statue", category: "Art Object", costGp: 100, weightLb: 0, detail: "", description: "Unconfirmed: check the book before handing it out." },
  chalice: { name: "Gold Chalice", category: "Art Object", costGp: 150, weightLb: 1, detail: "", description: "From the goblin shrine." },
  knife: { name: "Jeweled Knife", category: "Art Object", costGp: 60, weightLb: 1, detail: "", description: "From the goblin shrine." },
  censer: { name: "Censer", category: "Art Object", costGp: 120, weightLb: 2, detail: "", description: "From the goblin shrine." },
  map: { name: "Gundren's Map to Wave Echo Cave", category: "Quest Item", costGp: 0, weightLb: 0, detail: "", description: "Gundren Rockseeker's map showing the way to Wave Echo Cave." },
  gp: { name: "Gold Pieces", category: "Coins", costGp: 1, weightLb: 0.02, detail: "", description: "" },
  sp: { name: "Silver Pieces", category: "Coins", costGp: 0.1, weightLb: 0.02, detail: "", description: "" },
  ep: { name: "Electrum Pieces", category: "Coins", costGp: 0.5, weightLb: 0.02, detail: "", description: "" },
};

const srdItem = (slug) => ({ source: "srd", edition: "2014", slug });
const custom = (key) => ({ custom: key });
const item = (ref, quantity = 1, note = "") => ({ ref, quantity, note });
// A creature: SRD slug, count, and an optional name/HP/notes override for a named one.
const foe = (slug, count = 1, override = {}) => ({ slug, count, ...override });

const ROOMS = [
  { name: "Archer Post (Area 3)", foes: [foe("goblin", 2)], items: [] },
  { name: "Ruined Barracks (Area 4)", foes: [foe("goblin", 3)], items: [] },
  {
    name: "Storeroom (Area 5)",
    foes: [],
    items: [item(custom("brandy")), item(custom("sildarGear"))],
  },
  {
    name: "Hobgoblin Barracks (Area 6)",
    foes: [foe("hobgoblin", 4)],
    items: [
      item(srdItem("spear"), 1, "Weapon rack"),
      item(srdItem("longsword"), 1, "Weapon rack"),
      item(srdItem("maul"), 1, "Weapon rack"),
      item(srdItem("greatsword"), 1, "Weapon rack"),
      item(custom("staff")),
    ],
  },
  {
    name: "Banquet Hall (Area 7)",
    foes: [foe("goblin", 7), foe("goblin", 1, { name: "Yegg", kind: "npc", hp: 12, notes: "Goblin cook." })],
    items: [],
  },
  { name: "Dark Hall (Area 8)", foes: [foe("grick")], items: [item(custom("statue"))] },
  {
    name: "Goblin Shrine (Area 9)",
    foes: [foe("goblin", 1, { name: "Lhupo", kind: "npc", notes: "Goblin priest." }), foe("goblin", 2)],
    items: [item(custom("chalice")), item(custom("knife")), item(custom("censer"))],
  },
  { name: "Guard Barracks (Area 12)", foes: [foe("hobgoblin", 2)], items: [] },
  {
    name: "Owlbear Tower (Area 13)",
    foes: [foe("owlbear")],
    items: [
      item(custom("ep"), 90, "Hidden chest (DC 15 Wisdom to find)"),
      item(custom("gp"), 120, "Hidden chest (DC 15 Wisdom to find)"),
      item(srdItem("potion-of-healing"), 1, "Hidden chest"),
      item(srdItem("spell-scroll-2nd-level"), 1, "Scroll of silence. Hidden chest"),
      item(srdItem("spell-scroll-3rd-level"), 1, "Scroll of revivify. Hidden chest"),
    ],
  },
  {
    name: "King's Quarters (Area 14)",
    foes: [
      foe("bugbear", 1, { name: "King Grol", kind: "npc", hp: 45, notes: "Bugbear chief. Holds Gundren Rockseeker prisoner." }),
      foe("wolf", 1, { name: "Snarl", notes: "Grol's wolf." }),
      foe("doppelganger", 1, { name: "Vyerith", kind: "npc", notes: "Doppelganger posing as a drow." }),
    ],
    items: [
      item(custom("sp"), 220),
      item(custom("ep"), 160),
      item(srdItem("potion-of-healing"), 3),
      item(custom("map")),
    ],
  },
  { name: "Returning War Band (Area 15, optional)", foes: [foe("hobgoblin", 3), foe("wolf", 2)], items: [] },
];

const SUMMARY = "Lair of the Cragmaw goblins and King Grol. Gundren Rockseeker is held in the King's Quarters (Area 14).";
const NOTES = [
  "Prisoner: Gundren Rockseeker (King's Quarters, Area 14).",
  "Optional: the returning war band (Area 15) arrives while the party is inside.",
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
        ref: { source: "srd", edition: "2014", slug: f.slug },
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
    if (room.foes.length) {
      encounterId = randomUUID();
      const encounter = { name: room.name, round: 0, turn: 0, combatants: combatants(room.foes) };
      insertEncounter.run(encounterId, room.name, JSON.stringify(encounter), campaignId, at, at);
      linkEncounter.run(areaId, encounterId, battlePos++);
    }
    for (const reward of room.items) {
      const ref = reward.ref.custom ? { source: "custom", id: customIds[reward.ref.custom] } : reward.ref;
      const refKey = ref.source === "srd" ? `srd:${ref.edition}/${ref.slug}` : `custom:${ref.id}`;
      // A room without a battle files its loot under the area, so the room goes in the note.
      const note = encounterId ? reward.note : [room.name, reward.note].filter(Boolean).join(". ");
      insertReward.run(randomUUID(), areaId, encounterId, rewardPos++, refKey, JSON.stringify({ itemRef: ref, quantity: reward.quantity, note }));
    }
  }
  db.exec("COMMIT");
  console.log(`Added "${AREA_NAME}" (${areaId}) with ${battlePos} battles and ${rewardPos} rewards, campaign ${campaignId ?? "unassigned"}.`);
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
