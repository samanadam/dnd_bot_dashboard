"use client";

import { dmCall } from "@/lib/dm/client";
import type { ExtTokenInfo } from "./tokens";

export type ExtOverview = {
  tokens: ExtTokenInfo[];
  campaigns: Array<{ id: string; name: string }>;
  synced: Array<{ sheetId: string; campaignId: string; name: string; ddbCharacterId: string; syncedAt: string; lastError: string | null }>;
};

export const EXT_KEY = ["ext-tokens"] as const;

export const extApi = {
  overview: () => dmCall<ExtOverview>("GET", "ext/tokens"),
  create: (label: string, campaignId: string) => dmCall<{ id: string; token: string }>("POST", "ext/tokens", { label, campaignId }),
  revoke: (id: string) => dmCall<void>("DELETE", `ext/tokens/${encodeURIComponent(id)}`),
};
