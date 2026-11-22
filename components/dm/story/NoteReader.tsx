"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { PortalLink } from "@/components/PortalLink";
import { Badge, Button } from "@/components/ui";
import type { StorySummary } from "@/lib/dm/story";
import type { StoryDetail } from "@/lib/dm/storyRoutes";
import { makeResolver } from "./helpers";
import { NoteEditor } from "./NoteEditor";
import { newNoteHref } from "./helpers";
import { StoryBody } from "./StoryBody";
import { TYPE_COLOR, TYPE_LABEL } from "./types";

/** A note to read, with its backlinks, and an Edit button that swaps in the editor. */
export function NoteReader({ detail, notes }: { detail: StoryDetail; notes: StorySummary[] }) {
  const [editing, setEditing] = useState(false);
  const { note, backlinks, missing } = detail;
  const resolve = makeResolver(notes, note.campaignId);

  if (editing) return <NoteEditor notes={notes} initial={detail} onCancel={() => setEditing(false)} />;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full" style={{ background: TYPE_COLOR[note.type] }} />
          <Badge>{TYPE_LABEL[note.type]}</Badge>
          {note.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
        </div>
        <Button icon={Pencil} onClick={() => setEditing(true)}>
          Edit
        </Button>
      </div>

      <article className="rounded-3xl border border-border bg-surface p-5 shadow-card sm:p-6">
        {note.body.trim() ? <StoryBody body={note.body} resolve={resolve} campaignId={note.campaignId} /> : <p className="text-sm text-muted">This note is empty. Press Edit to write it.</p>}
      </article>

      {missing.length > 0 ? (
        <section aria-label="Missing links">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-warn">Linked but not written yet</h2>
          <div className="flex flex-wrap gap-2">
            {missing.map((title) => (
              <PortalLink key={title} href={newNoteHref(title, note.campaignId)} className="rounded-full border border-dashed border-warn/60 px-3 py-1 text-sm text-warn hover:bg-warn/10">
                Create “{title}”
              </PortalLink>
            ))}
          </div>
        </section>
      ) : null}

      {backlinks.length > 0 ? (
        <section aria-label="Backlinks">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted">Mentioned in</h2>
          <div className="flex flex-wrap gap-2">
            {backlinks.map((link) => (
              <PortalLink key={link.id} href={`/dm/story/notes/${link.id}`} className="rounded-full border border-border px-3 py-1 text-sm hover:border-accent/60 hover:text-accent">
                {link.title}
              </PortalLink>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
