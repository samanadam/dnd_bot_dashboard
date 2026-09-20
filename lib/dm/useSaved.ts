"use client";

import { useQuery } from "@tanstack/react-query";
import type { Selection } from "@/lib/campaign/selection";
import { dm } from "./client";

/** Every saved-link query lives under this key, so one invalidation refreshes them all. */
export const SAVED_KEY = ["dm", "saved"] as const;

/** Saved links for a campaign selection; null is every campaign. */
export function useSaved(selection: Selection) {
  return useQuery({
    queryKey: [...SAVED_KEY, selection ?? "all"],
    queryFn: () => dm.listSaved(selection ?? undefined),
    staleTime: 15_000,
  });
}
