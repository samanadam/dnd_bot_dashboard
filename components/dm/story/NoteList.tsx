"use client";

import { Plus, ScrollText, Search } from "lucide-react";
import { useState } from "react";
import { PortalLink } from "@/components/PortalLink";
import { Badge, EmptyState, inputClass } from "@/components/ui";
import { NOTE_TYPES, type NoteType, type StorySummary } from "@/lib/dm/story";
import { allTags, filterNotes } from "./helpers";
import { TYPE_COLOR, TYPE_LABEL } from "./types";

export function NoteList({ notes }: { notes: StorySummary[] }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<NoteType | "all">("all");
  const [tag, setTag] = useState<string | null>(null);
  const shown = filterNotes(notes, { query, type, tag });
  const tags = allTags(notes);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input className={`${inputClass} pl-10`} type="search" aria-label="Search notes" placeholder="Search titles and tags" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <select className={`${inputClass} sm:w-44`} aria-label="Filter by type" value={type} onChange={(event) => setType(event.target.value as NoteType | "all")}>
          <option value="all">All types</option>
          {NOTE_TYPES.map((t) => (
            <option key={t} value={t}>{TYPE_LABEL[t]}</option>
          ))}
        </select>
        <PortalLink href="/dm/story/notes/new" className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent-strong">
          <Plus className="size-4" aria-hidden /> New note
        </PortalLink>
      </div>

      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by tag">
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tag === t}
              onClick={() => setTag(tag === t ? null : t)}
              className={`rounded-full border px-3 py-1 text-xs transition ${tag === t ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:border-border-strong hover:text-text"}`}
            >
              {t}
            </button>
          ))}
        </div>
      ) : null}

      {notes.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border py-8">
          <EmptyState icon={ScrollText} title="No notes yet">
            Write down a place, a faction, a secret. Link notes together with double square brackets and they show up on the map.
          </EmptyState>
        </div>
      ) : shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No note matches.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {shown.map((note) => (
            <li key={note.id} className="group relative rounded-3xl border border-border bg-surface p-4 shadow-card transition hover:border-accent/50">
              <PortalLink href={`/dm/story/notes/${note.id}`} className="block after:absolute after:inset-0 after:rounded-3xl">
                <span className="flex items-center gap-2">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: TYPE_COLOR[note.type] }} />
                  <span className="truncate font-display text-lg font-semibold group-hover:text-accent">{note.title}</span>
                </span>
                <span className="mt-2 flex flex-wrap gap-1.5">
                  <Badge>{TYPE_LABEL[note.type]}</Badge>
                  {note.tags.map((t) => <Badge key={t}>{t}</Badge>)}
                  {note.missing.length > 0 ? <Badge tone="warn">{note.missing.length} missing link{note.missing.length === 1 ? "" : "s"}</Badge> : null}
                </span>
              </PortalLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
