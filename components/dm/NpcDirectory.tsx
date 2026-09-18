"use client";

import { Heart, Search, Shield, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState, inputClass } from "@/components/ui";

export type NpcCard = { id: string; name: string; type: string; cr: string; ac: number; hp: number; tags: string[]; teaser: string };

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function NpcDirectory({ npcs }: { npcs: NpcCard[] }) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const tags = useMemo(() => [...new Set(npcs.flatMap((npc) => npc.tags))].sort((a, b) => a.localeCompare(b)), [npcs]);

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("en");
    return npcs.filter(
      (npc) =>
        (!tag || npc.tags.includes(tag)) &&
        (!q || npc.name.toLocaleLowerCase("en").includes(q) || npc.teaser.toLocaleLowerCase("en").includes(q) || npc.tags.some((t) => t.toLocaleLowerCase("en").includes(q))),
    );
  }, [npcs, query, tag]);

  if (npcs.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border py-6">
        <EmptyState icon={Users} title="No NPCs yet">
          Add the innkeeper, the villain and everyone in between. Only you can see them.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
        <label htmlFor="npc-search" className="sr-only">
          Search NPCs
        </label>
        <input id="npc-search" type="search" className={`${inputClass} pl-10`} placeholder="Search names, notes and tags" value={query} maxLength={80} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {tags.length ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by tag">
          {tags.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={tag === value}
              onClick={() => setTag(tag === value ? null : value)}
              className={`rounded-full border px-3 py-1 text-xs transition ${tag === value ? "border-accent/50 bg-accent-soft text-accent" : "border-border bg-surface-2 text-muted hover:text-text"}`}
            >
              {value}
            </button>
          ))}
        </div>
      ) : null}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((npc) => (
          <li key={npc.id}>
            <Link
              href={`/dm/bestiary/custom/${npc.id}`}
              className="group flex h-full flex-col gap-3 rounded-3xl border border-border bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:border-accent/50"
            >
              <span className="flex items-center gap-3">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-accent-soft to-surface-3 font-display text-lg font-bold text-accent">
                  {initials(npc.name) || "?"}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-display text-xl font-semibold leading-tight group-hover:text-accent">{npc.name}</span>
                  <span className="block truncate text-xs text-muted">{npc.type}</span>
                </span>
              </span>
              {npc.teaser ? <span className="line-clamp-3 text-sm text-muted">{npc.teaser}</span> : null}
              <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 text-xs tabular-nums text-muted">
                <span className="flex items-center gap-1">
                  <Shield className="size-3" aria-hidden /> {npc.ac}
                </span>
                <span className="flex items-center gap-1">
                  <Heart className="size-3" aria-hidden /> {npc.hp}
                </span>
                <span>CR {npc.cr}</span>
                {npc.tags.slice(0, 3).map((value) => (
                  <span key={value} className="rounded-full border border-border px-2 py-px text-[11px]">
                    {value}
                  </span>
                ))}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {shown.length === 0 ? <p className="py-6 text-center text-sm text-muted">No NPC matches.</p> : null}
    </div>
  );
}
