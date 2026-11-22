"use client";

import { Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { usePortalRouter } from "@/components/PortalLink";
import { useToast } from "@/components/Providers";
import { Button, Field, inputBaseClass, inputClass } from "@/components/ui";
import { useDmDefaultCampaign } from "@/lib/campaign/useSelection";
import { dm, DmError } from "@/lib/dm/client";
import { NOTE_TYPES, type NoteType, type StorySummary } from "@/lib/dm/story";
import type { StoryDetail } from "@/lib/dm/storyRoutes";
import { makeResolver, parseTags } from "./helpers";
import { StoryBody } from "./StoryBody";
import { TYPE_LABEL } from "./types";

/**
 * Writes a note. With `initial` it edits that note; without, it creates one in the
 * campaign being looked at. A 409 (someone saved first, or the title is taken)
 * shows the server's own message and keeps what was typed.
 */
export function NoteEditor({ notes, initial, initialTitle = "", initialCampaign, onCancel }: { notes: StorySummary[]; initial?: StoryDetail; initialTitle?: string; initialCampaign?: string | null; onCancel?: () => void }) {
  const router = usePortalRouter();
  const toast = useToast();
  const pickedCampaign = useDmDefaultCampaign();
  // A link that asked for a note names the campaign it was written in; otherwise the one picked in the switcher.
  const defaultCampaign = initialCampaign === undefined ? pickedCampaign : initialCampaign;
  const [title, setTitle] = useState(initial?.note.title ?? initialTitle);
  const [type, setType] = useState<NoteType>(initial?.note.type ?? "other");
  const [tags, setTags] = useState(initial?.note.tags.join(", ") ?? "");
  const [body, setBody] = useState(initial?.note.body ?? "");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const resolve = makeResolver(notes, initial ? initial.note.campaignId : defaultCampaign);

  async function save() {
    setBusy(true);
    try {
      const input = { title, type, tags: parseTags(tags), body };
      if (initial) {
        await dm.updateStoryNote(initial.note.id, initial.note.version, input);
        toast("ok", "Note saved.");
        router.refresh();
      } else {
        const created = await dm.createStoryNote({ ...input, campaignId: defaultCampaign });
        router.push(`/dm/story/notes/${created.note.id}`);
      }
    } catch (error) {
      toast("danger", error instanceof DmError ? error.message : "Could not save the note.");
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-4 rounded-3xl border border-border bg-surface p-4 shadow-card sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_12rem]">
        <Field label="Title" hint="Other notes link to this one by writing it in double square brackets.">
          <input className={inputClass} value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="Type">
          <select className={inputClass} value={type} onChange={(event) => setType(event.target.value as NoteType)}>
            {NOTE_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Tags" hint="Comma separated, up to 12.">
        <input className={inputClass} value={tags} onChange={(event) => setTags(event.target.value)} />
      </Field>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm font-medium">Note</span>
          <div role="group" aria-label="Editor mode" className="flex rounded-lg border border-border p-0.5 text-xs">
            {[false, true].map((on) => (
              <button key={String(on)} type="button" aria-pressed={preview === on} onClick={() => setPreview(on)} className={`rounded-md px-3 py-1 ${preview === on ? "bg-accent-soft text-accent" : "text-muted"}`}>
                {on ? "Preview" : "Write"}
              </button>
            ))}
          </div>
        </div>
        {preview ? (
          <div className="min-h-48 rounded-xl border border-border bg-surface-2 p-4">
            {body.trim() ? <StoryBody body={body} resolve={resolve} campaignId={initial ? initial.note.campaignId : defaultCampaign} /> : <p className="text-sm text-muted">Nothing to preview yet.</p>}
          </div>
        ) : (
          <textarea className={`${inputBaseClass} min-h-64 w-full py-2.5 font-mono text-sm`} aria-label="Note body" value={body} maxLength={50_000} onChange={(event) => setBody(event.target.value)} />
        )}
        <p className="mt-1.5 text-xs text-muted">Markdown: # headings, - lists, **bold**, *italic*, &gt; quotes, and [[Another note]] to link.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {initial ? (
          <Button variant="danger-ghost" icon={Trash2} onClick={() => setDeleting(true)}>
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          {onCancel ? <Button onClick={onCancel}>Cancel</Button> : null}
          <Button type="submit" variant="primary" icon={Save} busy={busy} disabled={!title.trim()}>
            Save
          </Button>
        </div>
      </div>

      {initial ? (
        <ConfirmDialog
          open={deleting}
          title={`Delete ${initial.note.title}?`}
          confirmLabel="Delete"
          busy={busy}
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await dm.deleteStoryNote(initial.note.id);
              toast("ok", "Note deleted.");
              router.push("/dm/story/notes");
            } catch (error) {
              toast("danger", error instanceof DmError ? error.message : "Could not delete.");
              setBusy(false);
              setDeleting(false);
            }
          }}
        >
          <p>The note is removed. Links to it in other notes stay in place and show as missing.</p>
        </ConfirmDialog>
      ) : null}
    </form>
  );
}
