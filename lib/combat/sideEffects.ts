import { isPartySide } from "@/lib/dm/encounter";
import type { StoredEncounter } from "@/lib/dm/encounters";
import type { SheetRepo } from "@/lib/sheets/repo";
import { linkedStates } from "./battleRoutes";
import type { BattleInitiativeRepo, CampaignSettingsRepo, NoteRepo } from "./store";

// What saving or deleting an encounter sets off outside it: the bot's
// initiative roster (so /init can roll from the sheet), turn pings, and
// clearing notes and battle-page rolls when a fight ends. All best effort.

export type RosterEntry = { user_id: string; label: string; bonus: number };

export type SideEffectDeps = {
  sheets: () => SheetRepo;
  notes: () => NoteRepo;
  battleRolls: () => BattleInitiativeRepo;
  settings: () => CampaignSettingsRepo;
  pushRoster: (campaignId: string | null, entries: RosterEntry[]) => Promise<unknown>;
  clearRoster: () => Promise<unknown>;
  pingTurn: (ping: { channel_id: string; user_id: string; character_name: string; encounter_name: string; round: number }) => Promise<unknown>;
  now?: () => number;
};

// The last ping per encounter, so clicking through turns does not flood the channel.
const lastPing = new Map<string, { combatantId: string; at: number }>();
export const PING_THROTTLE_MS = 3000;

function roster(stored: StoredEncounter, sheets: SheetRepo): RosterEntry[] {
  const linked = linkedStates(stored.encounter, sheets, stored.campaignId);
  const seen = new Set<string>();
  const entries: RosterEntry[] = [];
  for (const c of stored.encounter.combatants) {
    if (c.ref?.source !== "character" || c.hidden) continue;
    const live = linked.get(c.ref.id);
    if (!live?.ownerUserId || seen.has(live.ownerUserId)) continue;
    seen.add(live.ownerUserId);
    entries.push({ user_id: live.ownerUserId, label: c.name.slice(0, 40), bonus: Math.max(-20, Math.min(40, live.initiativeBonus)) });
  }
  return entries.slice(0, 20);
}

const partyKey = (stored: StoredEncounter) =>
  stored.encounter.combatants
    .filter((c) => c.ref?.source === "character" && !c.hidden)
    .map((c) => (c.ref as { id: string }).id)
    .sort()
    .join(",");

export function sideEffects(deps: SideEffectDeps) {
  const now = deps.now ?? Date.now;
  return {
    async afterSave(before: StoredEncounter, after: StoredEncounter): Promise<void> {
      if (after.kind !== "live") return;
      const wasShown = Boolean(before.encounter.shownToPlayers);
      const shown = Boolean(after.encounter.shownToPlayers);
      const ended = before.encounter.round > 0 && after.encounter.round === 0;
      const tasks: Promise<unknown>[] = [];

      if (ended || (wasShown && !shown)) {
        tasks.push(deps.clearRoster());
        if (ended) {
          deps.notes().purgeFightOnly(after.id);
          deps.battleRolls().remove(after.id);
          lastPing.delete(after.id);
        }
      } else if (shown && (!wasShown || partyKey(before) !== partyKey(after))) {
        tasks.push(deps.pushRoster(after.campaignId, roster(after, deps.sheets())));
      }

      const moved = before.encounter.round !== after.encounter.round || before.encounter.turn !== after.encounter.turn;
      if (shown && moved && after.encounter.round >= 1 && after.campaignId) {
        const current = after.encounter.combatants[after.encounter.turn];
        const settings = deps.settings().get(after.campaignId);
        const last = lastPing.get(after.id);
        if (
          current &&
          !current.hidden &&
          isPartySide(current) &&
          current.ref?.source === "character" &&
          settings.turnPing.enabled &&
          settings.turnPing.channelId &&
          last?.combatantId !== current.id &&
          (!last || now() - last.at >= PING_THROTTLE_MS)
        ) {
          const sheet = deps.sheets().get(current.ref.id);
          if (sheet?.ownerUserId && sheet.campaignId === after.campaignId) {
            lastPing.set(after.id, { combatantId: current.id, at: now() });
            tasks.push(
              deps.pingTurn({
                channel_id: settings.turnPing.channelId,
                user_id: sheet.ownerUserId,
                character_name: current.name.slice(0, 40),
                encounter_name: after.encounter.name.slice(0, 80),
                round: after.encounter.round,
              }),
            );
          }
        }
      }
      await Promise.allSettled(tasks);
    },

    async afterDelete(stored: StoredEncounter): Promise<void> {
      deps.notes().purgeFightOnly(stored.id);
      deps.battleRolls().remove(stored.id);
      lastPing.delete(stored.id);
      if (stored.encounter.shownToPlayers) await deps.clearRoster().catch(() => undefined);
    },
  };
}

/** For tests: forget the ping throttle. */
export function resetPingThrottle() {
  lastPing.clear();
}
