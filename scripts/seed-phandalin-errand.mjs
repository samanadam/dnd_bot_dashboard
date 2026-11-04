// Adds Garaele's errand (Phandalin, Triboar Trail, Conyberry, Agatha's lair) to the
// portal database as one area: a prepared battle per stop, the loot as item
// rewards tied to the stop's battle, and non-SRD treasure as custom items.
// Vyrael and the banshee are not in the SRD, so they are stored with a null ref.
//
//   node seed-phandalin-errand.mjs <path/to/portal.db> [campaignId]
//
// Without a campaign id the area is filed under the only campaign the database
// already uses; with none or several, pass one (or "none" for unassigned).
// Refuses to run twice: it stops if an area with the same name exists.

import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

const [path, campaignArg] = process.argv.slice(2);
if (!path) {
  console.error("usage: node seed-phandalin-errand.mjs <portal.db> [campaignId|none]");
  process.exit(1);
}

const AREA_NAME = "Garaele's Errand";

const SRD = {
  orc: { name: "Orc", ac: 13, hp: 15, init: 1 },
  "brown-bear": { name: "Brown Bear", ac: 11, hp: 34, init: 0 },
  druid: { name: "Druid", ac: 11, hp: 27, init: 1 },
  drow: { name: "Drow", ac: 15, hp: 13, init: 2 },
  "giant-spider": { name: "Giant Spider", ac: 14, hp: 26, init: 3 },
  bugbear: { name: "Bugbear", ac: 16, hp: 27, init: 2 },
  vyrael: { name: "Vyrael, the Spider's Hand", ac: 15, hp: 45, init: 3, srd: false },
  banshee: { name: "Agatha the Banshee", ac: 12, hp: 58, init: 1, srd: false },
};

const CUSTOM = {
  gp: { name: "Gold Pieces", category: "Coins", costGp: 1, weightLb: 0.02, detail: "", description: "" },
  comb: { name: "Garaele's Silver Comb", category: "Quest Item", costGp: 0, weightLb: 0, detail: "", description: "Gift for Agatha." },
  totems: { name: "Crude Orc Totems", category: "Trinket", costGp: 0, weightLb: 1, detail: "", description: "" },
  letter: { name: "Spider-Sealed Letter", category: "Quest Item", costGp: 0, weightLb: 0, detail: "", description: "Says \"the Spider's Hand\" is waiting at Conyberry." },
  goodberry: { name: "Goodberry Pouch", category: "Consumable", costGp: 0, weightLb: 0.1, detail: "", description: "From Nymra Velkyn." },
  bearCharm: { name: "Bear-Tooth Charm", category: "Trinket", costGp: 0, weightLb: 0, detail: "", description: "From Nymra Velkyn." },
  medallion: { name: "Black Spider Medallion", category: "Quest Item", costGp: 0, weightLb: 0, detail: "", description: "A key later." },
  poisonBolts: { name: "Drow Poison Bolts", category: "Ammunition", costGp: 0, weightLb: 0.1, detail: "", description: "Crossbow bolts coated in drow poison." },
  gems: { name: "Gems (about 120 gp total)", category: "Gem", costGp: 120, weightLb: 0, detail: "", description: "" },
  ledger: { name: "Ledger Scrap", category: "Quest Item", costGp: 0, weightLb: 0, detail: "", description: "Names \"the Forge\"." },
  cloak: { name: "Vyrael's Cloak", category: "Wondrous Item", costGp: 0, weightLb: 1, detail: "temporary", description: "Works as a cloak of elvenkind until it spends a day in sunlight, then crumbles." },
  silk: { name: "Spider Silk", category: "Trade Good", costGp: 25, weightLb: 1, detail: "", description: "About 25 gp." },
};

const srdItem = (slug) => ({ source: "srd", edition: "2014", slug });
const custom = (key) => ({ custom: key });
const item = (ref, quantity = 1, note = "") => ({ ref, quantity, note });
// A creature: key into SRD, count, and an optional name/HP/notes override for a named one.
const foe = (slug, count = 1, override = {}) => ({ slug, count, ...override });

const NYMRA = { name: "Nymra Velkyn", kind: "npc", friendly: true, notes: "Drow druid (CR 2). Ally unless the party attacks her." };
const BEAR = { friendly: true, notes: "Nymra's bear." };

const ROOMS = [
  {
    name: "Phandalin",
    foes: [],
    items: [item(custom("comb"), 1, "Garaele's quest reward")],
  },
  {
    name: "Triboar Trail",
    foes: [foe("orc", 4), foe("druid", 1, NYMRA), foe("brown-bear", 2, BEAR)],
    items: [
      item(custom("gp"), 15, "Orcs (about)"),
      item(srdItem("greataxe"), 1, "Orcs"),
      item(custom("totems"), 1, "Orcs"),
      item(custom("letter"), 1, "Courier"),
      item(custom("gp"), 40, "Courier"),
      item(srdItem("potion-of-healing"), 1, "Courier"),
      item(custom("goodberry"), 2, "Nymra's gift"),
      item(custom("bearCharm"), 1, "Nymra's gift"),
    ],
  },
  {
    name: "Conyberry Ruins",
    foes: [foe("vyrael", 1, { kind: "npc" }), foe("drow"), foe("giant-spider")],
    items: [
      item(custom("medallion"), 1, "Vyrael"),
      item(srdItem("crossbow-hand"), 1, "Vyrael"),
      item(custom("poisonBolts"), 3, "Vyrael"),
      item(custom("gems"), 1, "Vyrael"),
      item(custom("ledger"), 1, "Vyrael"),
      item(custom("cloak"), 1, "Vyrael"),
      item(custom("gp"), 30, "Drow and spider"),
      item(srdItem("rope-hempen-50-feet"), 1, "Drow and spider"),
      item(custom("silk"), 1, "Drow and spider"),
    ],
  },
  {
    name: "Agatha's Lair",
    foes: [foe("banshee", 1, { kind: "npc", friendly: true, notes: "Non-hostile if treated with respect. Fades rather than fights." })],
    items: [],
  },
  {
    name: "Back in Phandalin",
    foes: [],
    items: [item(srdItem("potion-of-healing"), 3, "Garaele's reward")],
  },
];

const SUMMARY = "Garaele's errand: carry a silver comb to Agatha and learn where the Spider's Hand hides.";
const NOTES = [
  "Triboar Trail: Nymra Velkyn is an ally unless attacked. Info from the courier: the Spider's Hand waits at Conyberry.",
  "Conyberry: if Nymra joins, add 1 drow and 1 bugbear. Vyrael is homebrew drow, CR 3; stats are placeholders.",
  "Agatha's Lair: one truthful answer. Bowgentle's spellbook was traded to the necromancer Tsernoth of Iriaebor.",
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
        friendly: f.friendly ?? false,
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
