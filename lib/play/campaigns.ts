import "server-only";
import { campaignsFor, type Access } from "@/lib/access/permissions";
import { botCampaigns } from "@/lib/access/routeDeps";

export type PlayCampaign = { id: string; name: string };

/**
 * The campaigns this user plays in or manages sheets for: the ones their grants
 * name, or every active campaign for an "all campaigns" grant. Names come from the bot through
 * the server; a player never needs a bot permission to see them. null when the
 * bot cannot be asked.
 */
export async function playCampaigns(access: Access): Promise<PlayCampaign[] | null> {
  // Where the user plays, or manages the players' sheets.
  const scopes = [campaignsFor(access, "play"), campaignsFor(access, "sheets.manage")].filter((s) => s !== null);
  if (scopes.length === 0) return [];
  const all = await botCampaigns();
  if (!all) return null;
  const everywhere = scopes.includes("all");
  const named = new Set(scopes.flatMap((s) => (s === "all" ? [] : [...s])));
  return all
    .filter((c) => (everywhere ? !c.archived : named.has(c.id)))
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
