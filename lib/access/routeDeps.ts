import "server-only";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { botServer } from "@/lib/bot/server";
import { getDatabase } from "@/lib/dm/database";
import { GrantRepo, UserRepo } from "./grants";
import { guildRoleSchema, type CampaignChoice, type GuildRole } from "./routes";
import { getAccess } from "./server";

const campaignListSchema = z.array(z.object({ id: z.string().regex(/^[a-f0-9]{12}$/), name: z.string().max(200), archived: z.boolean() }).passthrough());

/** Every campaign the bot knows, archived included. null when the bot cannot be asked. */
export async function botCampaigns(): Promise<CampaignChoice[] | null> {
  const result = await botServer("GET", "campaigns?archived=1", { schema: campaignListSchema });
  return result.ok ? result.data.map(({ id, name, archived }) => ({ id, name, archived })) : null;
}

export async function guildRoles(): Promise<GuildRole[] | null> {
  const result = await botServer("GET", "guild/roles", { schema: z.array(guildRoleSchema).max(250) });
  return result.ok ? result.data : null;
}

export function accessDeps() {
  return {
    getAccess,
    grants: () => new GrantRepo(getDatabase()),
    users: () => new UserRepo(getDatabase()),
    roles: guildRoles,
    campaigns: botCampaigns,
    log: audit,
  };
}
