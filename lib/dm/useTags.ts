"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { dm } from "./client";
import { tagCounts, type TagMap } from "./tags";

/** Every tag query lives under this key, so one invalidation refreshes them all. */
export const TAGS_KEY = ["dm", "tags"] as const;

const NONE: TagMap = {};

/**
 * Every tagged sound, plus how many sounds use each tag. Off for anyone who is
 * not the DM: reading tags is the DM's, and the portal would answer 404.
 */
export function useTags(enabled = true) {
  const query = useQuery({ queryKey: TAGS_KEY, queryFn: dm.listTags, staleTime: 15_000, enabled });
  const map = query.data ?? NONE;
  const counts = useMemo(() => tagCounts(map), [map]);
  return { map, counts, tagsOf: (ref: string) => map[ref] ?? [], query };
}

/** Replaces one sound's tags and refreshes every list that shows them. */
export function useSetTags() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { ref: string; tags: string[] }) => dm.setTags(input.ref, input.tags),
    onSuccess: (saved) => {
      client.setQueryData<TagMap>(TAGS_KEY, (previous) => {
        const next = { ...(previous ?? {}) };
        if (saved.tags.length > 0) next[saved.ref] = saved.tags;
        else delete next[saved.ref];
        return next;
      });
    },
    onSettled: () => void client.invalidateQueries({ queryKey: TAGS_KEY }),
  });
}
