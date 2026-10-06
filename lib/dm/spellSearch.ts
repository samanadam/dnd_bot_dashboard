import { SCHOOLS, type School, type SpellRef } from "./spells";
import type { FeatRef } from "./feats";

// The search behind the spell and feat browsers: query parsing and filtering,
// pure, so the real route and the demo transport answer exactly alike.

export type SpellSearchResult = {
  ref: SpellRef;
  name: string;
  level: number;
  school: School;
  castingTime: string;
  concentration: boolean;
  ritual: boolean;
  classes: string[];
  author: "dm" | "player";
};

export type FeatSearchResult = {
  ref: FeatRef;
  name: string;
  category: string;
  prerequisite: string;
  author: "dm" | "player";
};

export const SEARCH_SOURCES = ["all", "custom", "2014", "2024"] as const;
export type SearchSource = (typeof SEARCH_SOURCES)[number];
export const MAX_PAGE = 60;

type Paging = { q: string; source: SearchSource; offset: number; limit: number };

export type SpellQuery = Paging & {
  levels: number[] | null;
  school: School | null;
  className: string | null;
  concentration: boolean | null;
  ritual: boolean | null;
};

export type FeatQuery = Paging & { category: string | null };

type Parsed<T> = { ok: true; query: T } | { ok: false; message: string };

export const fold = (text: string) => text.toLocaleLowerCase("en");

function paging(params: URLSearchParams): Parsed<Paging> {
  const source = params.get("source") ?? "all";
  if (!(SEARCH_SOURCES as readonly string[]).includes(source)) return { ok: false, message: "Invalid source." };
  const offset = Math.max(0, Math.min(100_000, Number.parseInt(params.get("offset") ?? "0", 10) || 0));
  const limit = Math.max(1, Math.min(MAX_PAGE, Number.parseInt(params.get("limit") ?? "40", 10) || 40));
  return { ok: true, query: { q: fold((params.get("q") ?? "").trim().slice(0, 80)), source: source as SearchSource, offset, limit } };
}

function flag(value: string | null): boolean | null | undefined {
  if (value === null || value === "") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function parseSpellQuery(params: URLSearchParams): Parsed<SpellQuery> {
  const base = paging(params);
  if (!base.ok) return base;

  let levels: number[] | null = null;
  const levelText = params.get("level");
  if (levelText) {
    const parts = levelText.split(",");
    if (parts.length > 10 || !parts.every((p) => /^[0-9]$/.test(p))) return { ok: false, message: "Invalid level." };
    levels = [...new Set(parts.map(Number))];
  }

  const schoolText = params.get("school");
  if (schoolText && !(SCHOOLS as readonly string[]).includes(schoolText)) return { ok: false, message: "Invalid school." };

  const className = (params.get("class") ?? "").trim();
  if (className.length > 40) return { ok: false, message: "Invalid class." };

  const concentration = flag(params.get("concentration"));
  const ritual = flag(params.get("ritual"));
  if (concentration === undefined) return { ok: false, message: "Invalid concentration." };
  if (ritual === undefined) return { ok: false, message: "Invalid ritual." };

  return {
    ok: true,
    query: {
      ...base.query,
      levels,
      school: (schoolText || null) as School | null,
      className: className ? fold(className) : null,
      concentration,
      ritual,
    },
  };
}

export function parseFeatQuery(params: URLSearchParams): Parsed<FeatQuery> {
  const base = paging(params);
  if (!base.ok) return base;
  const category = (params.get("category") ?? "").trim();
  if (category.length > 40) return { ok: false, message: "Invalid category." };
  return { ok: true, query: { ...base.query, category: category ? fold(category) : null } };
}

const inSource = (ref: SpellRef, source: SearchSource) =>
  source === "all" || (source === "custom" ? ref.source === "custom" : ref.source === "srd" && ref.edition === source);

export function searchSpells(all: SpellSearchResult[], query: SpellQuery) {
  const pool = all.filter((s) => inSource(s.ref, query.source));
  const matches = pool
    .filter(
      (s) =>
        (!query.q || fold(s.name).includes(query.q)) &&
        (!query.levels || query.levels.includes(s.level)) &&
        (!query.school || s.school === query.school) &&
        (!query.className || s.classes.some((c) => fold(c) === query.className)) &&
        (query.concentration === null || s.concentration === query.concentration) &&
        (query.ritual === null || s.ritual === query.ritual),
    )
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name) || refOrder(a.ref).localeCompare(refOrder(b.ref)));
  const classes = [...new Set(pool.flatMap((s) => s.classes))].sort((a, b) => a.localeCompare(b));
  return { total: matches.length, results: matches.slice(query.offset, query.offset + query.limit), classes, schools: [...SCHOOLS] };
}

export function searchFeats(all: FeatSearchResult[], query: FeatQuery) {
  const pool = all.filter((f) => inSource(f.ref, query.source));
  const matches = pool
    .filter((f) => (!query.q || fold(f.name).includes(query.q)) && (!query.category || fold(f.category) === query.category))
    .sort((a, b) => a.name.localeCompare(b.name) || refOrder(a.ref).localeCompare(refOrder(b.ref)));
  const categories = [...new Set(pool.map((f) => f.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return { total: matches.length, results: matches.slice(query.offset, query.offset + query.limit), categories };
}

// Newer edition first when two spells share a name, custom before both.
function refOrder(ref: SpellRef): string {
  return ref.source === "custom" ? "0" : ref.edition === "2024" ? "1" : "2";
}
