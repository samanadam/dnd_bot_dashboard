import "server-only";
import { UserRepo } from "@/lib/access/grants";
import { can } from "@/lib/access/permissions";
import { botCampaigns } from "@/lib/access/routeDeps";
import { getAccess } from "@/lib/access/server";
import { accessFor, rolesOf } from "@/lib/access/store";
import { audit } from "@/lib/audit";
import { botServer } from "@/lib/bot/server";
import { DdbLinkRepo } from "@/lib/ddb/links";
import { getDatabase } from "@/lib/dm/database";
import { SheetRepo } from "@/lib/sheets/repo";
import { ExtTokenRepo } from "./tokens";
import type { ExtDeps } from "./routes";
import type { ExtTokenRouteDeps } from "./tokenRoutes";

export function extDeps(): ExtDeps {
  return {
    tokens: () => new ExtTokenRepo(getDatabase()),
    links: () => new DdbLinkRepo(getDatabase()),
    sheets: () => new SheetRepo(getDatabase()),
    users: () => new UserRepo(getDatabase()),
    playsIn: async (userId, campaignId) => can(accessFor(userId, rolesOf(userId)), "play", campaignId),
    syncName: async (campaignId, userId, name) => {
      const result = name
        ? await botServer("POST", `campaigns/${campaignId}/characters`, { body: { user_id: userId, character_name: name.slice(0, 40) }, userId })
        : await botServer("POST", `campaigns/${campaignId}/characters/clear`, { body: { user_id: userId }, userId });
      return result.ok;
    },
    announce: async (roll, userId) => (await botServer("POST", "dice/announce", { body: { ...roll, origin: "sheet" }, userId })).ok,
    log: audit,
  };
}

export function extTokenDeps(): ExtTokenRouteDeps {
  return {
    getAccess,
    tokens: () => new ExtTokenRepo(getDatabase()),
    links: () => new DdbLinkRepo(getDatabase()),
    campaigns: async () => (await botCampaigns())?.map(({ id, name }) => ({ id, name })) ?? null,
    log: audit,
  };
}
