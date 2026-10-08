import "server-only";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { botServer } from "@/lib/bot/server";
import { getDatabase } from "@/lib/dm/database";
import { GrantRepo, UserRepo } from "./grants";
import { guildRoleSchema, type CampaignChoice, type GuildRole } from "./routes";
import { getAccess } from "./server";

const campaignListSchema = z.array(z.object({ id: z.string().regex(/^[a-f0-9]{12}$/), name: z.string().max(200), archived: z.boolean() }).passthrough());

// Every portal user shares the bot token and its rate limit, so lookups the
// server makes on page loads are kept briefly, like the proxy's read cache.
function cached<T>(ttlMs: number, load: () => Promise<T | null>): () => Promise<T | null> {
  let value: { at: number; data: T } | null = null;
  let inflight: Promise<T | null> | null = null;
  return async () => {
    if (value && Date.now() - value.at < ttlMs) return value.data;
    inflight ??= load()
      .then((data) => {
        if (data !== null) value = { at: Date.now(), data };
        return data ?? value?.data ?? null;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };
}

/** Every campaign the bot knows, archived included. null when the bot cannot be asked. */
export const botCampaigns: () => Promise<CampaignChoice[] | null> = cached(15_000, async () => {
  const result = await botServer("GET", "campaigns?archived=1", { schema: campaignListSchema });
  return result.ok ? result.data.map(({ id, name, archived }) => ({ id, name, archived })) : null;
});

export const guildRoles: () => Promise<GuildRole[] | null> = cached(30_000, async () => {
  const result = await botServer("GET", "guild/roles", { schema: z.array(guildRoleSchema).max(250) });
  return result.ok ? result.data : null;
});

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
