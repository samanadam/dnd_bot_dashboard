import "server-only";
import { z } from "zod";
import { UserRepo } from "@/lib/access/grants";
import { getAccess } from "@/lib/access/server";
import { audit } from "@/lib/audit";
import { botServer } from "@/lib/bot/server";
import { getDatabase } from "@/lib/dm/database";
import { EncounterRepo } from "@/lib/dm/encounters";
import { SheetRepo } from "@/lib/sheets/repo";
import { sideEffects } from "./sideEffects";
import { BattleInitiativeRepo, CampaignSettingsRepo, NoteRepo } from "./store";

const channelSchema = z.array(z.object({ id: z.string().regex(/^\d{17,20}$/), name: z.string().max(100), category: z.string().max(100).nullable() })).max(500);

// Short: these run while the DM's save waits; a slow bot must not stall the tracker.
const BOT_TIMEOUT_MS = 3000;

export const combatEffects = () =>
  sideEffects({
    sheets: () => new SheetRepo(getDatabase()),
    notes: () => new NoteRepo(getDatabase()),
    battleRolls: () => new BattleInitiativeRepo(getDatabase()),
    settings: () => new CampaignSettingsRepo(getDatabase()),
    pushRoster: (campaignId, entries) => botServer("POST", "initiative/roster", { body: { campaign_id: campaignId, entries }, timeoutMs: BOT_TIMEOUT_MS }),
    clearRoster: () => botServer("POST", "initiative/roster/clear", { body: {}, timeoutMs: BOT_TIMEOUT_MS }),
    pingTurn: (ping) => botServer("POST", "turn/announce", { body: ping, timeoutMs: BOT_TIMEOUT_MS }),
  });

export function battleDeps() {
  return {
    getAccess,
    encounters: () => new EncounterRepo(getDatabase()),
    sheets: () => new SheetRepo(getDatabase()),
    notes: () => new NoteRepo(getDatabase()),
    battleRolls: () => new BattleInitiativeRepo(getDatabase()),
    users: () => new UserRepo(getDatabase()),
    settings: () => new CampaignSettingsRepo(getDatabase()),
    channels: async () => {
      const result = await botServer("GET", "guild/channels", { schema: channelSchema });
      return result.ok ? result.data : null;
    },
    log: audit,
  };
}
