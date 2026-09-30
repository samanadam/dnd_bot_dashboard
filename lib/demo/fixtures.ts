import type { CampaignDetail, InitiativeReport, SessionSummary, SoundLayer, Track } from "@/lib/bot/types";
import type { Area } from "@/lib/dm/areas";
import type { Creature } from "@/lib/dm/creatures";
import type { Combatant, CreatureRef, Encounter } from "@/lib/dm/encounter";
import type { StoredEncounter } from "@/lib/dm/encounters";
import type { CustomItem } from "@/lib/dm/items";
import type { Reward } from "@/lib/dm/rewards";
import type { SavedTrack } from "@/lib/dm/saved";
import type { Scene } from "@/lib/dm/scenes";
import type { StatBlock } from "@/lib/dm/statblock";
import type { TagMap } from "@/lib/dm/tags";
import { DEMO_SRD_MONSTERS } from "./srdSample";

// Everything the demo shows at first. All of it is invented: the campaign, the
// people, the sessions and the Discord channel ids (which are obviously fake).
// Nothing here is read from, or written to, the real portal or bot.

export const DEMO_USER = { id: "000000000000000000", name: "Demo DM", image: null };
export const DEMO_VOICE_CHANNEL = "100000000000000001";
export const DEMO_TEXT_CHANNEL = "100000000000000002";

export const CAMPAIGN_EMBER = "dead0c0de001";
export const CAMPAIGN_CITADEL = "beef0c0de002";

// Fixed ids in the uuid shape every DM id is checked against.
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const IDS = {
  npcMayor: uuid(101),
  npcCaptain: uuid(102),
  npcWitch: uuid(103),
  monsterWight: uuid(111),
  encounterMill: uuid(201),
  encounterOwlbear: uuid(202),
  encounterBridge: uuid(203),
  encounterCellar: uuid(204),
  areaVillage: uuid(301),
  areaKeep: uuid(302),
  areaWoods: uuid(303),
  itemSignet: uuid(401),
  itemLantern: uuid(402),
  sceneTavern: uuid(501),
  sceneStorm: uuid(502),
  sceneBoss: uuid(503),
  savedHarp: uuid(601),
  savedRain: uuid(602),
  savedBell: uuid(603),
};

export type DemoCampaign = Omit<CampaignDetail, "session_count">;
export type DemoSession = Omit<SessionSummary, "campaign_name">;
export type DemoActive = {
  session_id: string;
  name: string | null;
  channel_id: string;
  channel_name: string;
  started: number;
  speakers: string[];
  warnings: string[];
  campaign_id: string | null;
};
export type DemoPlayer = {
  connected: boolean;
  channel_id: string | null;
  owner: "recording" | "music" | null;
  playing: boolean;
  paused: boolean;
  volume: number;
  loop: "off" | "track" | "queue";
  // Position at `anchor` (ms); the transport works out the live position.
  position: number;
  anchor: number;
  current: Track | null;
  queue: Track[];
};

function srdBlock(slug: string): StatBlock {
  const found = DEMO_SRD_MONSTERS.find((monster) => monster.slug === slug);
  if (!found) throw new Error(`demo SRD sample has no ${slug}`);
  return structuredClone(found.statBlock);
}

const srd = (edition: "2014" | "2024", slug: string): CreatureRef => ({ source: "srd", edition, slug });

function combatant(
  id: string,
  name: string,
  kind: Combatant["kind"],
  stats: { ac: number; hp: number; maxHp?: number; init?: number | null; bonus?: number; ref?: CreatureRef | null; friendly?: boolean },
): Combatant {
  return {
    id,
    name,
    kind,
    ref: stats.ref ?? null,
    initiative: stats.init ?? null,
    initiativeBonus: stats.bonus ?? 0,
    ac: stats.ac,
    hp: stats.hp,
    maxHp: stats.maxHp ?? stats.hp,
    tempHp: 0,
    conditions: [],
    concentration: false,
    friendly: stats.friendly ?? false,
    notes: "",
  };
}

const track = (id: string, title: string, duration: number | null): Track => ({ id, title, source: "r2", duration_seconds: duration });

export function demoFixtures(now: number) {
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

  // --- bot -----------------------------------------------------------------

  const library: Track[] = [
    track("music/tavern-ambience.ogg", "Tavern Ambience", 1840),
    track("music/dungeon-drips.ogg", "Dungeon Drips", 912),
    track("music/battle-drums.ogg", "Battle Drums", 245),
    track("music/forest-at-night.ogg", "Forest at Night", 1320),
    track("music/the-dragon-wakes.ogg", "The Dragon Wakes", 318),
    track("music/market-bustle.ogg", "Market Bustle", 1105),
    track("music/ember-hearth.ogg", "Ember Hearth", 402),
    track("music/sunken-halls.ogg", "Sunken Halls", 655),
  ];
  const ambience: Track[] = [
    ["rain-on-roof", "Rain on the Roof"],
    ["tavern-crowd", "Tavern Crowd"],
    ["cave-drips", "Cave Drips"],
    ["campfire", "Campfire"],
    ["storm-wind", "Storm Wind"],
  ].map(([id, title]) => track(`music/ambience/${id}.ogg`, title, null));
  const sfx: Track[] = [
    ["door-creak", "Door Creak"],
    ["thunder", "Thunder"],
    ["dragon-roar", "Dragon Roar"],
    ["sword-clash", "Sword Clash"],
    ["fireball", "Fireball"],
    ["wolf-howl", "Wolf Howl"],
  ].map(([id, title]) => track(`music/sfx/${id}.ogg`, title, null));

  const campaigns: DemoCampaign[] = [
    {
      id: CAMPAIGN_EMBER,
      name: "Embers of Hollowmere",
      channel_id: DEMO_VOICE_CHANNEL,
      language: "en",
      archived: false,
      terms: ["Hollowmere", "Veyra", "Ashenfall", "Brandwick"],
      corrections: [
        { heard: "hollow mare", correct: "Hollowmere" },
        { heard: "vera", correct: "Veyra" },
      ],
      characters: [
        { character_name: "Aria", member: "Player one" },
        { character_name: "Borin", member: "Player two" },
        { character_name: "Cass", member: "Player three" },
      ],
    },
    {
      id: CAMPAIGN_CITADEL,
      name: "The Sunless Citadel",
      channel_id: null,
      language: null,
      archived: false,
      terms: ["Meepo", "Yusdrayl"],
      corrections: [],
      characters: [],
    },
  ];

  const session = (
    id: string,
    name: string | null,
    startedMin: number,
    minutes: number | null,
    extra: Partial<DemoSession> = {},
  ): DemoSession => ({
    id,
    name,
    channel_name: "the-table",
    started_at: ago(startedMin),
    ended_at: minutes === null ? null : ago(startedMin - minutes),
    duration_seconds: minutes === null ? null : minutes * 60,
    transcribed: true,
    cancelled: false,
    speakers: ["DM", "Aria", "Borin", "Cass"],
    speaker_count: 4,
    campaign_id: CAMPAIGN_EMBER,
    ...extra,
  });

  const sessions: DemoSession[] = [
    session("2026-09-30-1400-a1b2c3d4", "Session 4: Fire in Brandwick", 60 * 5, 215, { transcribed: false }),
    session("2026-09-16-2030-b2c3d4e5", "Session 3: The Sunken Keep", 60 * 24 * 14, 240),
    session("2026-09-09-2015-c3d4e5f6", "Session 2: Ashes on the Road", 60 * 24 * 21, 190),
    session("2026-09-02-2000-d4e5f6a7", "Session 1: Arrival at Hollowmere", 60 * 24 * 28, 205),
    session("2026-08-28-1930-e5f6a7b8", "Citadel one-shot", 60 * 24 * 33, 170, { campaign_id: CAMPAIGN_CITADEL, speakers: ["DM", "Aria", "Borin"], speaker_count: 3 }),
    // Cut off by a restart; the sessions page offers to recover it.
    session("2026-08-26-2100-f6a7b8c9", null, 60 * 24 * 35, null, { transcribed: false, campaign_id: null, speakers: ["DM"], speaker_count: 1 }),
  ];
  const trash: Array<{ session: DemoSession; deleted_at: string }> = [
    { session: session("2026-08-20-2000-a7b8c9d0", "Mic check", 60 * 24 * 41, 4, { transcribed: false, campaign_id: null, speakers: ["DM"], speaker_count: 1 }), deleted_at: ago(60 * 24 * 3) },
  ];

  const active: DemoActive[] = [
    {
      session_id: "2026-09-30-2030-0d0e0f10",
      name: "Session 5: Into the Ashen Woods",
      channel_id: DEMO_VOICE_CHANNEL,
      channel_name: "the-table",
      started: now - 47 * 60_000,
      speakers: ["DM", "Aria", "Borin", "Cass"],
      warnings: [],
      campaign_id: CAMPAIGN_EMBER,
    },
  ];

  const player: DemoPlayer = {
    connected: true,
    channel_id: DEMO_VOICE_CHANNEL,
    owner: "recording",
    playing: true,
    paused: false,
    volume: 0.7,
    loop: "off",
    position: 312,
    anchor: now,
    current: library[3],
    queue: [library[6], library[1]],
  };

  const layers: SoundLayer[] = [{ id: "demo0001", kind: "ambience", track_id: ambience[3].id, title: ambience[3].title, volume: 0.6 }];

  const initiative: InitiativeReport[] = [
    { id: 1, label: "Aria", value: 17, at: ago(2) },
    { id: 2, label: "Cass", value: 12, at: ago(1) },
  ];

  // --- DM ------------------------------------------------------------------

  const creature = (id: string, kind: Creature["kind"], block: StatBlock, notes: string, tags: string[], campaignId: string | null, minutes: number): Creature => ({
    id,
    kind,
    statBlock: block,
    notes,
    tags,
    campaignId,
    createdAt: ago(minutes),
    updatedAt: ago(minutes / 2),
  });

  const mayor = { ...srdBlock("bandit-captain"), name: "Mayor Hollis Brand", alignment: "lawful neutral", type: "humanoid (human)" };
  const captain = { ...srdBlock("bandit-captain"), name: "Captain Veyra Thorn", alignment: "chaotic good", type: "humanoid (half-elf)" };
  const witch = { ...srdBlock("orc"), name: "Old Maren", alignment: "neutral", type: "humanoid (human)" };
  const wight = { ...srdBlock("zombie"), name: "Ash Wight", type: "undead", cr: "2" };

  const creatures: Creature[] = [
    creature(IDS.npcMayor, "npc", mayor, "Owes the **Ashen Guild** a debt he cannot pay. Will trade the old mill map for protection.\n\n- Nervous around fire\n- Knows the keep's back entrance", ["Hollowmere", "quest giver"], CAMPAIGN_EMBER, 60 * 24 * 30),
    creature(IDS.npcCaptain, "npc", captain, "Leads the river patrol. Suspects the mayor. Can become an ally if the party saves her crew at the bridge.", ["ally", "patrol"], CAMPAIGN_EMBER, 60 * 24 * 25),
    creature(IDS.npcWitch, "npc", witch, "Lives at the edge of the Ashen Woods. Sells potions; wants a troll's heart in return for the ritual.", ["woods", "merchant"], CAMPAIGN_EMBER, 60 * 24 * 20),
    creature(IDS.monsterWight, "monster", wight, "Risen from the burned village. Smells of smoke; vulnerable to cold water.", ["undead", "homebrew"], null, 60 * 24 * 18),
  ];

  const goblin = srdBlock("goblin");
  const owlbear = srdBlock("owlbear");
  const troll = DEMO_SRD_MONSTERS.find((m) => m.slug === "troll")!.statBlock;

  const party = (init: Array<number | null>): Combatant[] => [
    combatant("p-aria", "Aria", "player", { ac: 15, hp: 27, init: init[0], bonus: 3 }),
    combatant("p-borin", "Borin", "player", { ac: 18, hp: 34, init: init[1], bonus: 0 }),
    combatant("p-cass", "Cass", "player", { ac: 13, hp: 21, init: init[2], bonus: 2 }),
  ];

  const mill: Encounter = {
    name: "Ambush at the Old Mill",
    round: 2,
    turn: 1,
    combatants: [
      ...party([17, 9, 12]),
      combatant("m-goblin-1", "Goblin", "monster", { ac: goblin.ac, hp: 3, maxHp: goblin.hp, init: 14, bonus: 2, ref: srd("2014", "goblin") }),
      combatant("m-goblin-2", "Goblin 2", "monster", { ac: goblin.ac, hp: goblin.hp, init: 11, bonus: 2, ref: srd("2014", "goblin") }),
      combatant("m-boss", "Goblin Boss", "monster", { ac: 17, hp: 21, init: 15, bonus: 2, ref: srd("2024", "goblin-boss") }),
      combatant("n-veyra", "Captain Veyra Thorn", "npc", { ac: captain.ac, hp: captain.hp, init: 13, bonus: 3, ref: { source: "custom", id: IDS.npcCaptain }, friendly: true }),
    ],
  };
  mill.combatants.sort((a, b) => (b.initiative ?? -99) - (a.initiative ?? -99));
  mill.combatants[0] = { ...mill.combatants[0], conditions: [{ name: "Blessed", rounds: 8 }], concentration: false };
  const cass = mill.combatants.find((c) => c.id === "p-cass");
  if (cass) Object.assign(cass, { concentration: true, hp: 14 });

  const owlbearDen: Encounter = {
    name: "Owlbear Den",
    round: 0,
    turn: 0,
    combatants: [
      combatant("m-owlbear", "Owlbear", "monster", { ac: owlbear.ac, hp: owlbear.hp, bonus: 1, ref: srd("2014", "owlbear") }),
    ],
  };
  const bridge: Encounter = {
    name: "Troll under the Bridge",
    round: 0,
    turn: 0,
    combatants: [
      combatant("m-troll", "Troll", "monster", { ac: troll.ac, hp: troll.hp, bonus: 1, ref: srd("2024", "troll") }),
      combatant("m-wight", "Ash Wight", "monster", { ac: wight.ac, hp: wight.hp, bonus: -2, ref: { source: "custom", id: IDS.monsterWight } }),
    ],
  };
  const cellar: Encounter = {
    name: "Rats in the Cellar",
    round: 0,
    turn: 0,
    combatants: [
      combatant("m-spider", "Giant Spider", "monster", { ac: 14, hp: 26, bonus: 3, ref: srd("2024", "giant-spider") }),
      combatant("m-mimic", "Mimic", "monster", { ac: 12, hp: 58, bonus: 1, ref: srd("2024", "mimic") }),
    ],
  };

  const stored = (id: string, encounter: Encounter, kind: StoredEncounter["kind"], campaignId: string | null, minutes: number): StoredEncounter => ({
    id,
    version: 3,
    encounter,
    campaignId,
    kind,
    updatedAt: ago(minutes),
  });

  const encounters: StoredEncounter[] = [
    stored(IDS.encounterMill, mill, "live", CAMPAIGN_EMBER, 6),
    stored(IDS.encounterOwlbear, owlbearDen, "prepared", CAMPAIGN_EMBER, 60 * 26),
    stored(IDS.encounterBridge, bridge, "prepared", CAMPAIGN_EMBER, 60 * 50),
    stored(IDS.encounterCellar, cellar, "prepared", CAMPAIGN_CITADEL, 60 * 24 * 6),
  ];

  const area = (id: string, name: string, summary: string, notes: string, position: number, campaignId: string | null): Area => ({
    id,
    name,
    summary,
    notes,
    campaignId,
    position,
    version: 2,
    createdAt: ago(60 * 24 * 20),
    updatedAt: ago(60 * 24 * (3 - position)),
  });

  const areas: Area[] = [
    area(IDS.areaVillage, "Hollowmere Village", "A lakeside village still smoking from last month's fire. Everyone is hiding something.", "The **mill** is where the goblins cross. The mayor keeps the map in his desk.\n\n- Tavern: The Drowned Lantern\n- Temple of the Dawn, half burned", 0, CAMPAIGN_EMBER),
    area(IDS.areaKeep, "The Sunken Keep", "An old keep half under the lake. The troll guards the only dry bridge.", "Flooded lower level: difficult terrain. The Ashen Guild's ledger is in the chapel.", 1, CAMPAIGN_EMBER),
    area(IDS.areaWoods, "The Ashen Woods", "Burned forest where the owlbear hunts. Old Maren's hut is at its edge.", "", 2, CAMPAIGN_EMBER),
  ];
  const areaBattles: Record<string, string[]> = {
    [IDS.areaVillage]: [],
    [IDS.areaKeep]: [IDS.encounterBridge],
    [IDS.areaWoods]: [IDS.encounterOwlbear],
  };
  const reward = (n: number) => uuid(700 + n);
  const areaRewards: Record<string, Reward[]> = {
    [IDS.areaVillage]: [
      { id: reward(1), kind: "pointer", encounterId: null, status: "earned", title: "The mayor's map", condition: "Protect the mayor from the Ashen Guild's collectors", outcome: "He hands over the map of the keep's back entrance.", npcRef: { source: "custom", id: IDS.npcMayor } },
      { id: reward(2), kind: "item", encounterId: null, status: "given", itemRef: { source: "srd", edition: "2014", slug: "potion-of-healing" }, quantity: 2, note: "From the temple's last stores" },
      { id: reward(3), kind: "pointer", encounterId: null, status: "pending", title: "Veyra's trust", condition: "Tell Captain Veyra what the mayor is hiding", outcome: "The river patrol fights beside the party at the keep.", npcRef: { source: "custom", id: IDS.npcCaptain } },
    ],
    [IDS.areaKeep]: [
      { id: reward(4), kind: "item", encounterId: IDS.encounterBridge, status: "planned", itemRef: { source: "srd", edition: "2014", slug: "flame-tongue-longsword" }, quantity: 1, note: "In the troll's hoard" },
      { id: reward(5), kind: "item", encounterId: null, status: "planned", itemRef: { source: "custom", id: IDS.itemSignet }, quantity: 1, note: "Proof of the guild's bribes" },
      { id: reward(6), kind: "pointer", encounterId: null, status: "lost", title: "Save the prisoners", condition: "Reach the cells before the water rises", outcome: "The smith's family returns and forges for the party.", npcRef: null },
    ],
    [IDS.areaWoods]: [
      { id: reward(7), kind: "item", encounterId: IDS.encounterOwlbear, status: "planned", itemRef: { source: "srd", edition: "2024", slug: "boots-of-elvenkind" }, quantity: 1, note: "On a fallen ranger" },
      { id: reward(8), kind: "pointer", encounterId: null, status: "pending", title: "Maren's ritual", condition: "Bring Old Maren a troll's heart", outcome: "She lifts the smoke curse from the village.", npcRef: { source: "custom", id: IDS.npcWitch } },
    ],
  };

  const item = (id: string, block: Omit<CustomItem, "id" | "campaignId" | "createdAt" | "updatedAt">, minutes: number): CustomItem => ({
    id,
    ...block,
    campaignId: CAMPAIGN_EMBER,
    createdAt: ago(minutes),
    updatedAt: ago(minutes),
  });
  const items: CustomItem[] = [
    item(IDS.itemSignet, { name: "Ashen Guild Signet", category: "Ring", rarity: "Uncommon", attunement: "", costGp: 250, weightLb: 0, detail: "Opens guild doors", description: "A soot-black ring stamped with a burning eye. Guild members wave you through." }, 60 * 24 * 9),
    item(IDS.itemLantern, { name: "Drowned Lantern", category: "Wondrous Item", rarity: "Rare", attunement: "Required", costGp: 0, weightLb: 2, detail: "Bright light 30 ft., even underwater", description: "Its flame burns blue under water. While you carry it, you can breathe under water for 1 hour a day." }, 60 * 24 * 4),
  ];

  const scene = (id: string, input: Omit<Scene, "id" | "createdAt" | "updatedAt" | "campaignId">): Scene => ({
    id,
    ...input,
    campaignId: CAMPAIGN_EMBER,
    createdAt: ago(60 * 24 * 10),
    updatedAt: ago(60 * 24 * 2),
  });
  const scenes: Scene[] = [
    scene(IDS.sceneTavern, {
      name: "Night at the Drowned Lantern",
      category: "Town",
      replace: true,
      music: { source: "r2", id: library[0].id, title: library[0].title, volume: 0.6 },
      layers: [{ kind: "ambience", id: ambience[1].id, title: ambience[1].title, volume: 0.5 }],
    }),
    scene(IDS.sceneStorm, {
      name: "Storm on the lake road",
      category: "Travel",
      replace: true,
      music: null,
      layers: [
        { kind: "ambience", id: ambience[0].id, title: ambience[0].title, volume: 0.8 },
        { kind: "ambience", id: ambience[4].id, title: ambience[4].title, volume: 0.5 },
        { kind: "sfx", id: sfx[1].id, title: sfx[1].title, volume: 1 },
      ],
    }),
    scene(IDS.sceneBoss, {
      name: "The troll wakes",
      category: "Combat",
      replace: true,
      music: { source: "r2", id: library[2].id, title: library[2].title, volume: 0.8 },
      layers: [{ kind: "sfx", id: sfx[2].id, title: sfx[2].title, volume: 1 }],
    }),
  ];

  const saved = (id: string, input: Omit<SavedTrack, "id" | "createdAt" | "updatedAt">): SavedTrack => ({
    id,
    ...input,
    createdAt: ago(60 * 24 * 8),
    updatedAt: ago(60 * 24 * 8),
  });
  const savedTracks: SavedTrack[] = [
    saved(IDS.savedHarp, { source: "youtube", kind: "music", ref: "demoHarp001", title: "Quiet harp for a village at dusk (demo)", durationSeconds: 3600, campaignId: CAMPAIGN_EMBER }),
    saved(IDS.savedRain, { source: "soundcloud", kind: "ambience", ref: "demo-artist/rain-on-a-tent", title: "Rain on a tent (demo)", durationSeconds: 900, campaignId: null }),
    saved(IDS.savedBell, { source: "youtube", kind: "sfx", ref: "demoBell001", title: "Temple bell (demo)", durationSeconds: 8, campaignId: null }),
  ];

  const tags: TagMap = {
    [`bucket:${library[0].id}`]: ["town", "calm"],
    [`bucket:${library[2].id}`]: ["combat"],
    [`bucket:${library[4].id}`]: ["combat", "boss"],
    [`bucket:${library[3].id}`]: ["travel", "calm"],
    [`bucket:${ambience[0].id}`]: ["weather"],
    [`bucket:${ambience[4].id}`]: ["weather"],
    [`bucket:${sfx[2].id}`]: ["boss"],
    [`saved:${IDS.savedHarp}`]: ["town", "calm"],
    [`saved:${IDS.savedRain}`]: ["weather"],
  };

  return {
    bot: {
      startedAt: now - 3 * 24 * 3600_000,
      library,
      ambience,
      sfx,
      campaigns,
      sessions,
      trash,
      active,
      player,
      layers,
      initiative,
    },
    dm: { creatures, encounters, areas, areaBattles, areaRewards, items, scenes, saved: savedTracks, tags },
  };
}

export type DemoState = ReturnType<typeof demoFixtures>;
