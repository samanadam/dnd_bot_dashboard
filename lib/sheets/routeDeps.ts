import "server-only";
import { UserRepo } from "@/lib/access/grants";
import { can, resolveAccess } from "@/lib/access/permissions";
import { botCampaigns } from "@/lib/access/routeDeps";
import { getAccess } from "@/lib/access/server";
import { loadGrants } from "@/lib/access/store";
import { audit } from "@/lib/audit";
import { botServer } from "@/lib/bot/server";
import { getDatabase } from "@/lib/dm/database";
import { env } from "@/lib/env";
import { FeatRepo } from "@/lib/dm/feats";
import { SpellRepo } from "@/lib/dm/spells";
import { getSrdFeat, getSrdSpell, listSrdFeats, listSrdSpells } from "@/lib/dm/srdSpells";
import { diskPortraits } from "./portraitStore";
import { SheetRepo } from "./repo";
import type { RollToAnnounce } from "./routes";

/** Tells the bot which character a player is in a campaign, so transcripts use the sheet's name. */
async function syncName(campaignId: string, userId: string, name: string | null): Promise<boolean> {
  const result = name
    ? await botServer("POST", `campaigns/${campaignId}/characters`, { body: { user_id: userId, character_name: name.slice(0, 40) }, userId })
    : await botServer("POST", `campaigns/${campaignId}/characters/clear`, { body: { user_id: userId }, userId });
  return result.ok;
}

async function announce(roll: RollToAnnounce, userId: string): Promise<boolean> {
  const result = await botServer("POST", "dice/announce", { body: { ...roll, origin: "sheet" }, userId });
  return result.ok;
}

export function sheetDeps() {
  return {
    getAccess,
    sheets: () => new SheetRepo(getDatabase()),
    users: () => new UserRepo(getDatabase()),
    spells: () => new SpellRepo(getDatabase()),
    feats: () => new FeatRepo(getDatabase()),
    srdSpells: () => ({ list: listSrdSpells, get: getSrdSpell }),
    srdFeats: () => ({ list: listSrdFeats, get: getSrdFeat }),
    campaignIds: async () => {
      const campaigns = await botCampaigns();
      return campaigns ? new Set(campaigns.map((c) => c.id)) : null;
    },
    playsIn: (userId: string, roleIds: string[], campaignId: string) => can(resolveAccess(userId, roleIds, env().DM_USER_IDS, loadGrants()), "play", campaignId),
    syncName,
    announce,
    removePortrait: diskPortraits.remove,
    log: audit,
  };
}

export function portraitDeps() {
  return { getAccess, sheets: () => new SheetRepo(getDatabase()), portraits: diskPortraits, log: audit };
}
