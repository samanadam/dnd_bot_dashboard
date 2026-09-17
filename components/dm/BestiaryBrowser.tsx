"use client";

import { BookOpen, Heart, Search, Shield, X } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, inputBaseClass, inputClass } from "@/components/ui";
import type { MonsterSummary } from "@/lib/dm/srd";
import { CR_VALUES, crToNumber } from "@/lib/dm/statblock";

const PAGE = 48;

type Source = "all" | MonsterSummary["edition"];

const SOURCES: { value: Source; label: string }[] = [
  { value: "all", label: "All" },
  { value: "custom", label: "Mine" },
  { value: "2024", label: "SRD 2024" },
  { value: "2014", label: "SRD 2014" },
];

export function monsterHref(monster: MonsterSummary): string {
  return monster.edition === "custom" ? `/dm/bestiary/custom/${monster.id}` : `/dm/bestiary/srd/${monster.edition}/${monster.slug}`;
}

function baseType(type: string): string {
  return type.replace(/\s*\(.*\)$/, "").trim() || "Other";
}

export function CrMedal({ cr }: { cr: string }) {
  const value = crToNumber(cr);
  const tier = value >= 17 ? "border-danger/50 text-danger" : value >= 11 ? "border-warn/50 text-warn" : value >= 5 ? "border-accent/50 text-accent" : "border-border-strong text-muted";
  return (
    <span className={`grid size-12 shrink-0 place-items-center rounded-2xl border-2 bg-surface-2 ${tier}`}>
      <span className="text-center leading-none">
        <span className="block text-[9px] font-semibold uppercase tracking-widest opacity-70">CR</span>
        <span className="font-display text-base font-bold">{cr}</span>
      </span>
    </span>
  );
}

export function BestiaryBrowser({ monsters, initialSource = "all" }: { monsters: MonsterSummary[]; initialSource?: Source }) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<Source>(initialSource);
  const [type, setType] = useState("all");
  const [minCr, setMinCr] = useState("0");
  const [maxCr, setMaxCr] = useState("30");
  const [limit, setLimit] = useState(PAGE);
  const deferredQuery = useDeferredValue(query);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key === "/" && target && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const counts = useMemo(() => {
    const result: Record<Source, number> = { all: monsters.length, custom: 0, "2014": 0, "2024": 0 };
    for (const monster of monsters) result[monster.edition] += 1;
    return result;
  }, [monsters]);

  const types = useMemo(() => [...new Set(monsters.map((m) => baseType(m.type)))].sort(), [monsters]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLocaleLowerCase("en");
    const low = crToNumber(minCr);
    const high = crToNumber(maxCr);
    return monsters
      .filter((m) => source === "all" || m.edition === source)
      .filter((m) => type === "all" || baseType(m.type) === type)
      .filter((m) => {
        const cr = crToNumber(m.cr);
        return cr >= low && cr <= high;
      })
      .filter(
        (m) =>
          !q ||
          m.name.toLocaleLowerCase("en").includes(q) ||
          m.type.toLocaleLowerCase("en").includes(q) ||
          (m.tags ?? []).some((tag) => tag.toLocaleLowerCase("en").includes(q)),
      )
      .sort((a, b) => a.name.localeCompare(b.name) || b.edition.localeCompare(a.edition));
  }, [monsters, deferredQuery, source, type, minCr, maxCr]);

  const reset = () => {
    setQuery("");
    setSource("all");
    setType("all");
    setMinCr("0");
    setMaxCr("30");
    setLimit(PAGE);
  };
  const filtersActive = query !== "" || source !== "all" || type !== "all" || minCr !== "0" || maxCr !== "30";

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-3xl border border-border bg-surface p-3 shadow-card sm:p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <label htmlFor="bestiary-search" className="sr-only">
            Search monsters
          </label>
          <input
            ref={searchRef}
            id="bestiary-search"
            type="search"
            className={`${inputClass} pl-10 pr-12`}
            placeholder="Search by name, type or tag"
            value={query}
            maxLength={80}
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(PAGE);
            }}
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-border px-1.5 font-mono text-[11px] text-faint sm:block">/</kbd>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Source" className="flex flex-wrap gap-1 rounded-xl border border-border bg-bg/40 p-1">
            {SOURCES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={source === option.value}
                onClick={() => {
                  setSource(option.value);
                  setLimit(PAGE);
                }}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                  source === option.value ? "bg-surface-3 text-text shadow-card" : "text-muted hover:text-text"
                }`}
              >
                {option.label}
                <span className="tabular-nums text-faint">{counts[option.value]}</span>
              </button>
            ))}
          </div>
          <label htmlFor="bestiary-type" className="sr-only">
            Creature type
          </label>
          <select id="bestiary-type" className={`${inputBaseClass} h-10 min-w-36`} value={type} onChange={(event) => setType(event.target.value)}>
            <option value="all">All types</option>
            {types.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <label htmlFor="bestiary-cr-min">CR</label>
            <select id="bestiary-cr-min" className={`${inputBaseClass} h-10 w-20 px-2.5`} value={minCr} onChange={(event) => setMinCr(event.target.value)}>
              {CR_VALUES.map((cr) => (
                <option key={cr} value={cr}>
                  {cr}
                </option>
              ))}
            </select>
            <label htmlFor="bestiary-cr-max">to</label>
            <select id="bestiary-cr-max" className={`${inputBaseClass} h-10 w-20 px-2.5`} value={maxCr} onChange={(event) => setMaxCr(event.target.value)}>
              {CR_VALUES.map((cr) => (
                <option key={cr} value={cr}>
                  {cr}
                </option>
              ))}
            </select>
          </div>
          {filtersActive ? (
            <button type="button" onClick={reset} className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted hover:text-text">
              <X className="size-3.5" aria-hidden /> Clear filters
            </button>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-muted" aria-live="polite">
        {filtered.length === 1 ? "1 creature" : `${filtered.length.toLocaleString("en")} creatures`}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border">
          <EmptyState icon={BookOpen} title="Nothing matches">
            Try another name or widen the CR range.
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.slice(0, limit).map((monster) => (
            <li key={monster.id}>
              <Link
                href={monsterHref(monster)}
                className="group flex h-full items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-card transition hover:-translate-y-px hover:border-accent/50"
              >
                <CrMedal cr={monster.cr} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-display text-lg font-semibold leading-tight group-hover:text-accent">{monster.name}</span>
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {monster.size} {monster.type}
                  </span>
                  <span className="mt-1 flex items-center gap-3 text-xs tabular-nums text-muted">
                    <span className="flex items-center gap-1">
                      <Shield className="size-3" aria-hidden /> {monster.ac}
                    </span>
                    <span className="flex items-center gap-1">
                      <Heart className="size-3" aria-hidden /> {monster.hp}
                    </span>
                    <span
                      className={`ml-auto rounded-md border px-1.5 py-px text-[10px] font-medium ${
                        monster.edition === "custom" ? "border-accent/30 bg-accent-soft text-accent" : "border-border text-faint"
                      }`}
                    >
                      {monster.edition === "custom" ? (monster.kind === "npc" ? "NPC" : "Mine") : monster.edition}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {filtered.length > limit ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setLimit((value) => value + PAGE)}
            className="rounded-xl border border-border bg-surface-2 px-4 py-2 text-sm font-medium hover:bg-surface-3"
          >
            Show {Math.min(PAGE, filtered.length - limit)} more
          </button>
        </div>
      ) : null}
    </div>
  );
}
