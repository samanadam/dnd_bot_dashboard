import "server-only";
import { UserRepo } from "@/lib/access/grants";
import { can } from "@/lib/access/permissions";
import { accessFor, rolesOf } from "@/lib/access/store";
import { audit } from "@/lib/audit";
import { botServer } from "@/lib/bot/server";
import { DdbLinkRepo } from "@/lib/ddb/links";
import { getDatabase } from "@/lib/dm/database";
import { SheetRepo } from "@/lib/sheets/repo";
import { ExtTokenRepo } from "./tokens";
import type { ExtDeps } from "./routes";

export function extDeps(): ExtDeps {
  return {
    tokens: () => new ExtTokenRepo(getDatabase()),
    links: () => new DdbLinkRepo(getDatabase()),
    sheets: () => new SheetRepo(getDatabase()),
    users: () => new UserRepo(getDatabase()),
    playsIn: async (userId, campaignId) => can(accessFor(userId, rolesOf(userId)), "play", campaignId),
    announce: async (roll, userId) => (await botServer("POST", "dice/announce", { body: { ...roll, origin: "sheet" }, userId })).ok,
    log: audit,
  };
}
