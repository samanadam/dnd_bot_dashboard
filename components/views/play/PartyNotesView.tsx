"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Pencil, X } from "lucide-react";
import { useState } from "react";
import { PortalLink } from "@/components/PortalLink";
import { useToast } from "@/components/Providers";
import { Button, Notice, inputBaseClass } from "@/components/ui";
import { DmError } from "@/lib/dm/client";
import { partyNotes } from "@/lib/sheets/client";

/** A campaign's shared notes. The DM may mirror them to a Discord channel, where talk becomes notes too. */
export function PartyNotesView({ campaign }: { campaign: { id: string; name: string } }) {
  const toast = useToast();
  const client = useQueryClient();
  const key = ["party-notes", campaign.id];
  const query = useQuery({ queryKey: key, queryFn: () => partyNotes.list(campaign.id), refetchInterval: 10_000 });
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

  const run = async (action: () => Promise<unknown>, done?: () => void) => {
    try {
      await action();
      done?.();
      await client.invalidateQueries({ queryKey: key });
    } catch (error) {
      toast("danger", error instanceof DmError ? error.message : "Something went wrong.");
    }
  };

  return (
    <div className="space-y-4">
      <PortalLink href={`/play/c/${campaign.id}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ChevronLeft className="size-4" aria-hidden /> {campaign.name}
      </PortalLink>
      <h1 className="text-2xl font-semibold">Party notes</h1>
      {query.data && !query.data.channelSet ? <Notice tone="neutral">Not synced with Discord. The DM can pick a notes channel on the Party page.</Notice> : null}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) void run(() => partyNotes.add(campaign.id, text), () => setText(""));
        }}
      >
        <input aria-label="New note" className={`${inputBaseClass} h-10 flex-1`} maxLength={1500} placeholder="Write a note for the party…" value={text} onChange={(event) => setText(event.target.value)} />
        <Button type="submit" disabled={!text.trim()}>
          Add
        </Button>
      </form>
      {query.data && query.data.notes.length === 0 ? <p className="text-sm text-muted">No notes yet.</p> : null}
      <ul className="space-y-2">
        {(query.data?.notes ?? []).map((note) => (
          <li key={note.id} className="rounded-2xl border border-border bg-surface p-3 text-sm">
            <div className="flex items-center gap-2 text-xs text-muted">
              <span>{note.mine ? "You" : note.author}</span>
              <time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleString()}</time>
              <span className="ml-auto flex gap-1">
                {note.mine ? (
                  <button type="button" className="rounded p-0.5 hover:text-text" aria-label="Edit note" onClick={() => setEditing({ id: note.id, text: note.text })}>
                    <Pencil className="size-3.5" aria-hidden />
                  </button>
                ) : null}
                {note.canDelete ? (
                  <button type="button" className="rounded p-0.5 hover:text-danger" aria-label="Delete note" onClick={() => void run(() => partyNotes.remove(note.id))}>
                    <X className="size-3.5" aria-hidden />
                  </button>
                ) : null}
              </span>
            </div>
            {editing?.id === note.id ? (
              <form
                className="mt-1 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (editing.text.trim()) void run(() => partyNotes.update(note.id, editing.text), () => setEditing(null));
                }}
              >
                <input aria-label="Edit note text" className={`${inputBaseClass} h-9 flex-1`} maxLength={1500} value={editing.text} onChange={(event) => setEditing({ id: note.id, text: event.target.value })} />
                <Button type="submit" size="sm">
                  Save
                </Button>
              </form>
            ) : (
              <p className="mt-0.5 whitespace-pre-wrap">{note.text}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
