import type { Area, AreaRepo } from "./areas";
import type { CreatureRef } from "./encounter";
import type { EncounterRepo } from "./encounters";
import type { ItemRef } from "./items";
import type { Reward } from "./rewards";

// What the area page shows: the area, its battles by name, and each reward with
// the item or NPC it names looked up. A name that no longer resolves is reported
// as null ("missing"); deleting an encounter, item or creature never blocks.

export type RefLookup = {
  item: (ref: ItemRef) => { name: string; category: string; rarity: string } | null;
  creature: (ref: CreatureRef) => { name: string } | null;
};

export type BattleView = { id: string; name: string | null; combatants: number; prepared: boolean };
export type RewardView = Reward & {
  // The item (item rewards) or NPC (pointers with a link) it names; null when it no longer exists.
  resolved?: { name: string; category?: string; rarity?: string } | null;
};
export type AreaDetail = { area: Area; battles: BattleView[]; rewards: RewardView[] };

export function areaDetail(area: Area, deps: { areas: AreaRepo; encounters: EncounterRepo; lookup: RefLookup }): AreaDetail {
  const battles = deps.areas.encounterIds(area.id).map((id): BattleView => {
    const stored = deps.encounters.get(id);
    return { id, name: stored?.encounter.name ?? null, combatants: stored?.encounter.combatants.length ?? 0, prepared: stored?.kind === "prepared" };
  });
  const rewards = deps.areas.rewards(area.id).map((reward): RewardView => {
    if (reward.kind === "item") return { ...reward, resolved: deps.lookup.item(reward.itemRef) };
    if (reward.npcRef) return { ...reward, resolved: deps.lookup.creature(reward.npcRef) };
    return reward;
  });
  return { area, battles, rewards };
}
