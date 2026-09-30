"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { inDemo } from "@/lib/demo/base";
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
      document.cookie = `${CAMPAIGN_COOKIE}=${next ?? ""}; path=/; max-age=31536000; samesite=lax${secure}`;
      router.refresh();
    },
    [router, setRaw],
  );
  return [parseSelection(raw), set];
}
