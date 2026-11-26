import "server-only";
import { UserRepo } from "@/lib/access/grants";
import { can } from "@/lib/access/permissions";
import { botCampaigns } from "@/lib/access/routeDeps";
import { getAccess } from "@/lib/access/server";
import { accessFor, rolesOf } from "@/lib/access/store";
import { audit } from "@/lib/audit";
import { botServer } from "@/lib/bot/server";
import { DdbLinkRepo } from "@/lib/ddb/links";
import { CreatureRepo } from "@/lib/dm/creatures";
import { getDatabase } from "@/lib/dm/database";
import { LibraryPageRepo } from "@/lib/dm/libraryPages";
import { listSrd } from "@/lib/dm/srd";
import { SheetRepo } from "@/lib/sheets/repo";
import { ExtTokenRepo } from "./tokens";
import type { ExtDeps } from "./routes";
import type { ExtTokenRouteDeps } from "./tokenRoutes";

async function nameOnBot(campaignId: string, userId: string, name: string | null): Promise<boolean> {
  const result = name
    ? await botServer("POST", `campaigns/${campaignId}/characters`, { body: { user_id: userId, character_name: name.slice(0, 40) }, userId })
    : await botServer("POST", `campaigns/${campaignId}/characters/clear`, { body: { user_id: userId }, userId });
  return result.ok;
}

export function extDeps(): ExtDeps {
  return {
    tokens: () => new ExtTokenRepo(getDatabase()),
    links: () => new DdbLinkRepo(getDatabase()),
    sheets: () => new SheetRepo(getDatabase()),
    users: () => new UserRepo(getDatabase()),
    campaignsOf: async (userId) => {
      const access = accessFor(userId, rolesOf(userId));
      const known = await botCampaigns();
      return known ? known.filter((c) => can(access, "play", c.id)).map(({ id, name }) => ({ id, name })) : null;
    },
    isDm: (userId) => can(accessFor(userId, rolesOf(userId)), "dm"),
    creatures: () => new CreatureRepo(getDatabase()),
    libraryPages: () => new LibraryPageRepo(getDatabase()),
    srdMonsters: listSrd,
    syncName: nameOnBot,
    announce: async (roll, userId) => (await botServer("POST", "dice/announce", { body: { ...roll, origin: "sheet" }, userId })).ok,
    log: audit,
  };
}

export function extTokenDeps(): ExtTokenRouteDeps {
  return {
    getAccess,
    tokens: () => new ExtTokenRepo(getDatabase()),
    links: () => new DdbLinkRepo(getDatabase()),
    sheets: () => new SheetRepo(getDatabase()),
    syncName: nameOnBot,
    campaigns: async () => (await botCampaigns())?.map(({ id, name }) => ({ id, name })) ?? null,
    log: audit,
  };
}
