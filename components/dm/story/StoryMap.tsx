"use client";

import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PortalLink } from "@/components/PortalLink";
import { Badge, inputClass } from "@/components/ui";
import { dm } from "@/lib/dm/client";
import { NOTE_TYPES, type StorySummary } from "@/lib/dm/story";
import type { StoryDetail } from "@/lib/dm/storyRoutes";
import { makeResolver } from "./helpers";
import { StoryBody } from "./StoryBody";
import { StoryGraph } from "./StoryGraph";
import { TYPE_COLOR, TYPE_LABEL } from "./types";

/** The brain map: every note a node, every [[link]] an edge. Selecting a node reads the note beside it. */
export function StoryMap({ notes }: { notes: StorySummary[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState<StoryDetail | null>(null);
  // The side panel is a column from the sm breakpoint up and covers the map below it.
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 640px)");
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const graph = useMemo(() => notes.map((n) => ({ id: n.id, title: n.title, type: n.type, links: n.links })), [notes]);
  const picked = notes.find((n) => n.id === selected) ?? null;
  const detail = loaded?.note.id === selected ? loaded : null;

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    dm.getStoryNote(selected).then((d) => !cancelled && setLoaded(d), () => undefined);
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (notes.length === 0) {
    return <p className="rounded-3xl border border-dashed border-border py-12 text-center text-sm text-muted">Nothing to map yet. Write a few notes and link them with double square brackets.</p>;
  }

  return (
    <div className="relative h-[70dvh] min-h-[420px] overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
      <StoryGraph notes={graph} selected={selected} query={query} inset={picked && wide ? 384 : 0} onSelect={setSelected} />

      <div className="absolute left-3 top-3 w-56">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <input className={`${inputClass} h-10 pl-9`} type="search" aria-label="Find on the map" placeholder="Find a note" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>

      <ul className="pointer-events-none absolute bottom-3 left-3 flex max-w-[60%] flex-wrap gap-x-3 gap-y-1 rounded-xl bg-surface/80 px-3 py-2 text-xs text-muted backdrop-blur">
        {NOTE_TYPES.map((t) => (
          <li key={t} className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full" style={{ background: TYPE_COLOR[t] }} />
            {TYPE_LABEL[t]}
          </li>
        ))}
      </ul>

      {picked ? (
        <aside aria-label={picked.title} className="absolute inset-y-0 right-0 flex w-full flex-col overflow-y-auto border-l border-border bg-surface/95 backdrop-blur sm:w-96">
          <div className="sticky top-0 flex items-start gap-3 border-b border-border bg-surface/95 p-4 backdrop-blur">
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl font-semibold leading-tight">{picked.title}</h2>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Badge>{TYPE_LABEL[picked.type]}</Badge>
                {picked.tags.map((t) => <Badge key={t}>{t}</Badge>)}
              </div>
            </div>
            <button type="button" onClick={() => setSelected(null)} aria-label="Close note" className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-3">
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="space-y-5 p-4">
            {detail ? (
              detail.note.body.trim() ? <StoryBody body={detail.note.body} resolve={makeResolver(notes, detail.note.campaignId)} /> : <p className="text-sm text-muted">This note is empty.</p>
            ) : (
              <p className="text-sm text-muted">Loading…</p>
            )}
            <PortalLink href={`/dm/story/notes/${picked.id}`} className="inline-block text-sm font-medium text-accent hover:text-accent-strong">
              Open the note
            </PortalLink>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
