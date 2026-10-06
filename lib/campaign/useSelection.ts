"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { preferenceCookieLifetime } from "@/lib/consent";
import { inDemo } from "@/lib/demo/base";
import { useMyAccess } from "@/lib/access/client";
import { useCampaigns } from "@/lib/bot/useBotState";
import { useLocalValue } from "@/lib/useLocalValue";
import { CAMPAIGN_COOKIE, parseSelection, type Selection } from "./selection";

/**
 * The picked campaign. It is kept in localStorage for client components and in
 * a cookie so server-rendered pages can filter their lists the same way; both
 * hold only a campaign id, nothing private.
 */
export function useCampaignSelection(): [Selection, (next: Selection) => void] {
  const [raw, setRaw] = useLocalValue("portal.campaign");
  const router = useRouter();
  const set = useCallback(
    (next: Selection) => {
      setRaw(next ?? "");
      // The demo's campaigns are made up; the real portal's cookie is left alone.
      if (inDemo()) return;
      const secure = window.location.protocol === "https:" ? "; secure" : "";
      document.cookie = `${CAMPAIGN_COOKIE}=${next ?? ""}; path=/${preferenceCookieLifetime()}; samesite=lax${secure}`;
      router.refresh();
    },
    [router, setRaw],
  );
  return [parseSelection(raw), set];
}

/**
 * Where new DM content goes: the picked campaign. For a co-DM limited to some
 * campaigns who is looking at all of them, their first one, since they cannot
 * file anything under no campaign.
 */
export function useDmDefaultCampaign(): string | null {
  const [picked] = useCampaignSelection();
  const scope = useMyAccess()?.grants.get("dm");
  const campaigns = useCampaigns();
  if (picked && picked !== "unassigned") return picked;
  if (scope === undefined || scope === "all") return null;
  return (campaigns.data ?? []).find((c) => scope.has(c.id) && !c.archived)?.id ?? [...scope].sort()[0] ?? null;
}
