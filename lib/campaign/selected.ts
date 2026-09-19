import "server-only";
import { cookies } from "next/headers";
import { CAMPAIGN_COOKIE, parseSelection, type Selection } from "./selection";

/** The campaign the DM last picked on this device; null means all of them. */
export async function selectedCampaign(): Promise<Selection> {
  return parseSelection((await cookies()).get(CAMPAIGN_COOKIE)?.value);
}
