"use client";

import { useQuery } from "@tanstack/react-query";
import { Lock, StickyNote, Users } from "lucide-react";
import { Badge } from "@/components/ui";
import type { Combatant } from "@/lib/dm/encounter";
import { combat } from "@/lib/sheets/client";

/** Every note players wrote on this fight. The DM reads them all and edits none. */
export function BattleNotesPanel({ encounterId, combatants }: { encounterId: string; combatants: readonly Combatant[] }) {
  const notes = useQuery({ queryKey: ["dm-battle-notes", encounterId], queryFn: () => combat.dmNotes(encounterId), refetchInterval: 10_000 });
  if (!notes.data || notes.data.length === 0) return null;
  const nameOf = (key: string) => combatants.find((c) => c.id === key)?.name ?? "Gone";
  return (
    <section className="rounded-3xl border border-border bg-surface p-4 shadow-card sm:p-5" aria-label="Player notes">
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
        <StickyNote className="size-5 text-accent" aria-hidden /> Player notes
      </h2>
      <ul className="space-y-2">
        {notes.data.map((note) => (
          <li key={note.id} className="rounded-2xl border border-border bg-surface-2 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="font-medium text-text">{nameOf(note.targetKey)}</span>
              {note.targetLabel !== nameOf(note.targetKey) ? <span>(they see &ldquo;{note.targetLabel}&rdquo;)</span> : null}
              <span>· {note.author}</span>
              {note.visibility === "private" ? (
                <Badge>
                  <Lock className="size-3" aria-hidden /> Private
                </Badge>
              ) : (
                <Badge tone="accent">
                  <Users className="size-3" aria-hidden /> Party
                </Badge>
              )}
              {note.keep ? <Badge tone="ok">Kept</Badge> : null}
            </div>
            <p className="mt-1 whitespace-pre-wrap">{note.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
