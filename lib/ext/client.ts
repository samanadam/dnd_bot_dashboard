"use client";

import { dmCall } from "@/lib/dm/client";
import type { PendingCharacter, LinkStatus } from "@/lib/ddb/links";
import type { ExtTokenInfo } from "./tokens";

export type ExtOverview = {
  tokens: ExtTokenInfo[];
  campaigns: Array<{ id: string; name: string }>;
  synced: LinkStatus[];
  // Characters the extension sent that no campaign could be chosen for yet.
  pending: PendingCharacter[];
};

export const EXT_KEY = ["ext-tokens"] as const;

export const extApi = {
  overview: () => dmCall<ExtOverview>("GET", "ext/tokens"),
  create: (label: string) => dmCall<{ id: string; token: string }>("POST", "ext/tokens", { label }),
  /** Which portal campaign a D&D Beyond campaign means; the player's synced sheets of it move there. */
  choose: (ddbCampaignId: string, campaignId: string) => dmCall<{ moved: number }>("PUT", "ext/campaign", { ddbCampaignId, campaignId }),
  revoke: (id: string) => dmCall<void>("DELETE", `ext/tokens/${encodeURIComponent(id)}`),
};
