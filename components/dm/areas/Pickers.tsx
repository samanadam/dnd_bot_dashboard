"use client";

import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { inputClass } from "@/components/ui";
import { dm } from "@/lib/dm/client";
import type { CreatureSearchResult } from "@/lib/dm/creatureSearch";
import type { ItemSearchResult } from "@/lib/dm/itemRoutes";
import { RarityBadge } from "../items/ItemBlockView";

// Small search boxes that hand back one reference and its label. They never hold
// more than the first few matches; the full lists live on the Items and Bestiary pages.

export function ItemPicker({ campaign, onPick }: { campaign: string | null; onPick: (result: ItemSearchResult) => void }) {
  const [text, setText] = useState("");
  const q = useDeferredValue(text);
  const results = useQuery({
    queryKey: ["dm", "items", "pick", q, campaign ?? "all"],
    queryFn: () => dm.searchItems({ q, limit: 8, campaign: campaign ?? undefined }),
    placeholderData: (previous) => previous,
  });

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
        <label htmlFor="reward-item-search" className="sr-only">
          Search items
        </label>
        <input id="reward-item-search" type="search" className={`${inputClass} pl-10`} placeholder="Search items by name" value={text} maxLength={80} autoComplete="off" onChange={(event) => setText(event.target.value)} autoFocus />
      </div>
      <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-2xl border border-border bg-bg/40" aria-label="Matching items">
        {(results.data?.results ?? []).map((result) => (
          <li key={result.ref.source === "srd" ? `${result.ref.edition}/${result.ref.slug}` : result.ref.id}>
            <button type="button" onClick={() => onPick(result)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-surface-2">
              <span className="min-w-0 flex-1 truncate">{result.name}</span>
              <span className="shrink-0 text-xs text-muted">{result.category}</span>
              <RarityBadge rarity={result.rarity} />
              <span className="shrink-0 text-[11px] text-faint">{result.ref.source === "custom" ? "Mine" : `SRD ${result.ref.edition}`}</span>
            </button>
          </li>
        ))}
        {results.data && results.data.results.length === 0 ? <li className="px-3 py-3 text-sm text-muted">No item matches.</li> : null}
      </ul>
    </div>
  );
}

export function NpcPicker({ campaign, onPick }: { campaign: string | null; onPick: (result: CreatureSearchResult) => void }) {
  const [text, setText] = useState("");
  const q = useDeferredValue(text);
  const results = useQuery({
    queryKey: ["dm", "creatures", "pick", q, campaign ?? "all"],
    queryFn: () => dm.searchCreatures(q, campaign && campaign !== "unassigned" ? campaign : undefined),
    placeholderData: (previous) => previous,
  });

  return (
    <div className="space-y-2">
      <label htmlFor="reward-npc-search" className="sr-only">
        Search NPCs and monsters
      </label>
      <input id="reward-npc-search" type="search" className={inputClass} placeholder="Search your NPCs and the SRD monsters" value={text} maxLength={80} autoComplete="off" onChange={(event) => setText(event.target.value)} />
      <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-2xl border border-border bg-bg/40" aria-label="Matching creatures">
        {(results.data?.results ?? []).map((result) => (
          <li key={result.ref.source === "srd" ? `${result.ref.edition}/${result.ref.slug}` : result.ref.id}>
            <button type="button" onClick={() => onPick(result)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-surface-2">
              <span className="min-w-0 flex-1 truncate">{result.name}</span>
              <span className="shrink-0 text-xs text-muted">{result.detail}</span>
            </button>
          </li>
        ))}
        {results.data && results.data.results.length === 0 ? <li className="px-3 py-3 text-sm text-muted">No creature matches.</li> : null}
      </ul>
    </div>
  );
}
