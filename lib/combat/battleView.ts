import { isPartySide, isRevealed, type Combatant, type Encounter } from "@/lib/dm/encounter";

// What a player may see of a battle. Built on the server from an allowlist:
// every field below is copied on purpose, and nothing else of the encounter
// (AC, hit points of others, stat block references, the DM's notes, real names
// not yet revealed, hidden combatants) ever reaches a player's browser.

export type HealthBand = "max" | "mid" | "low" | "down";

/** Thirds of the maximum. Temporary hit points do not count. */
export function healthBand(hp: number, maxHp: number): HealthBand {
  if (hp <= 0) return "down";
  if (hp * 3 > maxHp * 2) return "max";
  if (hp * 3 >= maxHp) return "mid";
  return "low";
}

/** The live state of a character sheet in the fight; it wins over the encounter's copy. */
export type LinkedState = {
  hp: number;
  tempHp: number;
  maxHp: number;
  conditions: { name: string; rounds: number | null }[];
  concentration: string | null;
  deathSaves: { successes: number; failures: number };
  ownerUserId: string | null;
  hasPortrait: boolean;
};

export type BattleNote = {
  id: string;
  targetKey: string;
  targetLabel: string;
  text: string;
  visibility: "private" | "party";
  keep: boolean;
  mine: boolean;
  author: string;
  updatedAt: string;
};

export type PlayerBattleEntry = {
  key: string;
  label: string;
  side: "party" | "enemy";
  you: boolean;
  band: HealthBand;
  conditions: string[];
  initiative: number | null;
  portrait: string | null;
};

export type PlayerBattleView = {
  id: string;
  name: string;
  round: number;
  turn: { key: string } | { hidden: true } | null;
  entries: PlayerBattleEntry[];
  me: {
    characterId: string;
    key: string;
    name: string;
    hp: number;
    maxHp: number;
    tempHp: number;
    conditions: string[];
    concentration: string | null;
    deathSaves: { successes: number; failures: number };
    needsInitiative: boolean;
  } | null;
  notes: BattleNote[];
};

/** The label players see for a combatant (also stored with notes, so a later reveal changes nothing). */
export function playerLabel(c: Combatant, fallbackNumber: number): string {
  if (isRevealed(c)) return c.name;
  if (c.alias) return c.alias;
  return `Enemy ${c.playerNumber ?? fallbackNumber}`;
}

/** Labels for every visible combatant, numbering old enemies with no number in list order. */
export function playerLabels(encounter: Encounter): Map<string, string> {
  const labels = new Map<string, string>();
  let fallback = 0;
  for (const c of encounter.combatants) {
    if (c.hidden) continue;
    if (!isPartySide(c)) fallback++;
    labels.set(c.id, playerLabel(c, fallback));
  }
  return labels;
}

const linkedId = (c: Combatant) => (c.ref?.source === "character" ? c.ref.id : null);

export function toPlayerView(
  stored: { id: string; encounter: Encounter },
  linked: ReadonlyMap<string, LinkedState>,
  viewerUserId: string,
  notes: BattleNote[],
): PlayerBattleView {
  const { encounter } = stored;
  const labels = playerLabels(encounter);
  const visible = encounter.combatants.filter((c) => !c.hidden);

  const mineCombatant = visible.find((c) => {
    const id = linkedId(c);
    return id !== null && linked.get(id)?.ownerUserId === viewerUserId;
  });

  const entries: PlayerBattleEntry[] = visible.map((c) => {
    const sheetId = linkedId(c);
    const live = sheetId ? linked.get(sheetId) : undefined;
    const hp = live?.hp ?? c.hp;
    const maxHp = live?.maxHp ?? c.maxHp;
    const conditions = (live?.conditions ?? c.conditions).map((condition) => condition.name);
    const party = isPartySide(c);
    const you = c.id === mineCombatant?.id;
    return {
      key: c.id,
      label: labels.get(c.id) ?? "Someone",
      side: party ? "party" : "enemy",
      you,
      band: healthBand(hp, maxHp),
      conditions,
      initiative: you ? c.initiative : null,
      portrait: party && sheetId && live?.hasPortrait ? sheetId : null,
    };
  });

  let turn: PlayerBattleView["turn"] = null;
  if (encounter.round > 0) {
    const current = encounter.combatants[encounter.turn];
    turn = !current || current.hidden ? { hidden: true } : { key: current.id };
  }

  let me: PlayerBattleView["me"] = null;
  if (mineCombatant) {
    const sheetId = linkedId(mineCombatant)!;
    const live = linked.get(sheetId)!;
    me = {
      characterId: sheetId,
      key: mineCombatant.id,
      name: mineCombatant.name,
      hp: live.hp,
      maxHp: live.maxHp,
      tempHp: live.tempHp,
      conditions: live.conditions.map((condition) => condition.name),
      concentration: live.concentration,
      deathSaves: live.deathSaves,
      needsInitiative: mineCombatant.initiative === null,
    };
  }

  return { id: stored.id, name: encounter.name, round: encounter.round, turn, entries, me, notes };
}
