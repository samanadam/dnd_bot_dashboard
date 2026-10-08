import "server-only";
import { requireAccess } from "@/lib/access/server";
import { selectedCampaign } from "@/lib/campaign/selected";
import type { ScopedSelection } from "@/lib/campaign/selection";
import { campaignScope, type CampaignScope } from "./guard";
import { isDm } from "./isDm";

export { isDm };

/**
 * Page gate for the DM tools. Anyone without the `dm` permission gets a plain
 * 404. The scope says which campaigns this user's DM access reaches; pages that
 * read the database themselves must use it, exactly like the API routes do.
 */
export async function requireDm(): Promise<{ userId: string; scope: CampaignScope }> {
  const access = await requireAccess("dm");
  return { userId: access.userId, scope: campaignScope(access, "dm") };
}

/**
 * The campaign picked on this device, narrowed to the user's scope. A cookie
 * naming a campaign outside the scope falls back to all of theirs.
 */
export async function dmSelection(scope: CampaignScope): Promise<ScopedSelection> {
  return scope.narrow(await selectedCampaign()) ?? scope.narrow(null) ?? [];
}
