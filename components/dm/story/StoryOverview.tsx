"use client";

import { Map as MapIcon, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { PortalLink, usePortalRouter } from "@/components/PortalLink";
import { useToast } from "@/components/Providers";
import { Badge, Button, EmptyState } from "@/components/ui";
import { useDmDefaultCampaign } from "@/lib/campaign/useSelection";
import { dm, DmError } from "@/lib/dm/client";
import { NOTE_TYPES, type StorySummary } from "@/lib/dm/story";
import { countByType, missingTitles } from "./helpers";
import { TYPE_COLOR, TYPE_LABEL } from "./types";

function StarterButton() {
  const router = usePortalRouter();
  const toast = useToast();
  const campaign = useDmDefaultCampaign();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="primary"
      icon={Sparkles}
      busy={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await dm.seedStory(campaign);
          router.refresh();
        } catch (error) {
          toast("danger", error instanceof DmError ? error.message : "Could not add the template.");
        } finally {
          setBusy(false);
        }
      }}
    >
      Start with a template
    </Button>
  );
}

export function StoryOverview({ notes }: { notes: StorySummary[] }) {
  const counts = countByType(notes);
  const recent = [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const missing = missingTitles(notes).slice(0, 8);

  if (notes.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border py-10">
        <EmptyState icon={Sparkles} title="Your story starts here">
          Notes link together into a map of your campaign: places, factions, secrets, sessions. Begin with a few starter notes, or write your own.
        </EmptyState>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <StarterButton />
          <PortalLink href="/dm/story/notes/new" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface-2 px-4 text-sm font-medium hover:border-border-strong">
            <Plus className="size-4" aria-hidden /> Write a note
          </PortalLink>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ul className="flex flex-wrap gap-2" aria-label="Notes by type">
        {NOTE_TYPES.filter((t) => counts[t] > 0).map((t) => (
          <li key={t} className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm">
            <span aria-hidden className="size-2.5 rounded-full" style={{ background: TYPE_COLOR[t] }} />
            {TYPE_LABEL[t]} <span className="tabular-nums text-muted">{counts[t]}</span>
          </li>
        ))}
      </ul>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-label="Recently edited" className="rounded-3xl border border-border bg-surface p-5 shadow-card">
          <h2 className="mb-3 font-display text-lg font-semibold">Recently edited</h2>
          <ul className="space-y-1.5">
            {recent.map((note) => (
              <li key={note.id}>
                <PortalLink href={`/dm/story/notes/${note.id}`} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-surface-2">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: TYPE_COLOR[note.type] }} />
                  <span className="truncate">{note.title}</span>
                </PortalLink>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Linked but not written yet" className="rounded-3xl border border-border bg-surface p-5 shadow-card">
          <h2 className="mb-3 font-display text-lg font-semibold">Linked but not written yet</h2>
          {missing.length === 0 ? (
            <p className="text-sm text-muted">Every link points at a note. Nice.</p>
          ) : (
            <ul className="space-y-1.5">
              {missing.map(({ title, count }) => (
                <li key={title}>
                  <PortalLink href={`/dm/story/notes/new?title=${encodeURIComponent(title)}`} className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-2">
                    <span className="truncate text-warn">{title}</span>
                    <Badge tone="warn">linked {count}×</Badge>
                  </PortalLink>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <PortalLink href="/dm/story/map" className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-accent-strong">
        <MapIcon className="size-4" aria-hidden /> Open the map
      </PortalLink>
    </div>
  );
}
