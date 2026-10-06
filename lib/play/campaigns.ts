import "server-only";
import { campaignsFor, type Access } from "@/lib/access/permissions";
import { botCampaigns } from "@/lib/access/routeDeps";

export type PlayCampaign = { id: string; name: string };

/**
 * The campaigns this user plays in: the ones their `play` grants name, or every
 * active campaign for an "all campaigns" grant. Names come from the bot through
 * the server; a player never needs a bot permission to see them. null when the
 * bot cannot be asked.
 */
export async function playCampaigns(access: Access): Promise<PlayCampaign[] | null> {
  const scope = campaignsFor(access, "play");
  if (!scope) return [];
  const all = await botCampaigns();
  if (!all) return null;
  return all
    .filter((c) => (scope === "all" ? !c.archived : scope.has(c.id)))
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
