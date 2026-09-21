"use client";

import { Tag, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { MAX_TAG_LENGTH, MAX_TAGS, normaliseTags, tagSchema } from "@/lib/dm/tags";
import { useSetTags } from "@/lib/dm/useTags";
import { useToast } from "@/components/Providers";
import { DmError } from "@/lib/dm/client";

/** A short run of tags under a sound's name. Shows the first few and a count for the rest. */
export function TagChips({ tags, max = 3, className = "" }: { tags: readonly string[]; max?: number; className?: string }) {
  if (tags.length === 0) return null;
  const shown = tags.slice(0, max);
  const hidden = tags.length - shown.length;
  return (
    <ul className={`flex min-w-0 flex-wrap gap-1 ${className}`} aria-label="Tags">
      {shown.map((tag) => (
        <li key={tag} className="max-w-full truncate rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted" title={tag}>
          {tag}
        </li>
      ))}
      {hidden > 0 ? <li className="rounded-md px-1 py-0.5 text-[10px] leading-none text-faint">+{hidden}</li> : null}
    </ul>
  );
}

/** Tags to filter a list by. Picking several narrows it to sounds that have all of them. */
export function TagFilter({
  counts,
  selected,
  onChange,
}: {
  counts: readonly { tag: string; count: number }[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
}) {
  if (counts.length === 0) return null;
  const isOn = (tag: string) => selected.some((name) => name.toLowerCase() === tag.toLowerCase());
  return (
    <div role="group" aria-label="Filter by tag" className="flex flex-wrap items-center gap-1.5">
      <Tag className="size-3.5 text-faint" aria-hidden />
      {counts.map(({ tag, count }) => {
        const on = isOn(tag);
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? selected.filter((name) => name.toLowerCase() !== tag.toLowerCase()) : [...selected, tag])}
            className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              on ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface-2 text-muted hover:border-border-strong hover:text-text"
            }`}
          >
            {tag}
            <span className={`font-mono text-[10px] tabular-nums ${on ? "text-accent-fg/80" : "text-faint"}`}>{count}</span>
          </button>
        );
      })}
      {selected.length > 0 ? (
        <button
          type="button"
          onClick={() => onChange([])}
          className="h-7 rounded-full px-2.5 text-xs text-muted underline underline-offset-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

/**
 * Types tags as chips. A comma or Enter adds what has been typed, Backspace on an
 * empty box removes the last one, and leaving the box adds a half-typed tag.
 */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  disabled,
  autoFocus,
}: {
  value: readonly string[];
  onChange: (next: string[]) => void;
  suggestions?: readonly string[];
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const listId = useId();
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function commit(raw: string): boolean {
    const parts = raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) return true;
    for (const part of parts) {
      const parsed = tagSchema.safeParse(part);
      if (!parsed.success) {
        setProblem(part.length > MAX_TAG_LENGTH ? `A tag is at most ${MAX_TAG_LENGTH} characters.` : (parsed.error.issues[0]?.message ?? "That is not a valid tag."));
        return false;
      }
    }
    const next = normaliseTags([...value, ...parts]);
    if (next.length > MAX_TAGS) {
      setProblem(`A sound can have at most ${MAX_TAGS} tags.`);
      return false;
    }
    onChange(next);
    setDraft("");
    setProblem(null);
    return true;
  }

  const unused = suggestions.filter((tag) => !value.some((name) => name.toLowerCase() === tag.toLowerCase()));

  return (
    <div className="space-y-1.5">
      <div
        className={`flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border bg-bg px-2 py-1.5 focus-within:ring-4 ${
          problem ? "border-danger focus-within:ring-danger/15" : "border-border focus-within:border-accent focus-within:ring-accent/15"
        }`}
      >
        {value.map((tag) => (
          <span key={tag} className="inline-flex h-6 max-w-full items-center gap-1 rounded-lg bg-surface-3 pl-2 pr-1 text-xs font-medium">
            <span className="truncate">{tag}</span>
            <button
              type="button"
              disabled={disabled}
              aria-label={`Remove tag ${tag}`}
              onClick={() => onChange(value.filter((name) => name !== tag))}
              className="grid size-4 place-items-center rounded text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          className="h-6 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-faint"
          value={draft}
          disabled={disabled}
          autoFocus={autoFocus}
          list={listId}
          placeholder={value.length === 0 ? "tavern, night, calm" : "Add a tag"}
          aria-label="Add a tag"
          aria-invalid={problem ? true : undefined}
          onChange={(event) => {
            const text = event.target.value;
            setProblem(null);
            // A comma finishes a tag; what follows it starts the next one.
            if (text.includes(",")) {
              const cut = text.lastIndexOf(",");
              if (commit(text.slice(0, cut))) setDraft(text.slice(cut + 1));
              else setDraft(text);
            } else setDraft(text);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              // Adding a tag must not also submit the form around it.
              if (draft.trim()) {
                event.preventDefault();
                commit(draft);
              }
            } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (draft.trim()) commit(draft);
          }}
        />
        <datalist id={listId}>
          {unused.map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
      </div>
      {problem ? (
        <p role="alert" className="text-xs text-danger">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

/** A small window to change one sound's tags. `tagRef` says which sound it is. */
export function TagDialog({
  target,
  suggestions,
  onClose,
}: {
  target: { ref: string; title: string; tags: readonly string[] } | null;
  suggestions: readonly string[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const toast = useToast();
  const save = useSetTags();
  const [draft, setDraft] = useState<string[]>([]);
  // The window is reused for every sound: start from that sound's tags each time it opens.
  const [openRef, setOpenRef] = useState<string | null>(null);
  if (target && target.ref !== openRef) {
    setOpenRef(target.ref);
    setDraft([...target.tags]);
  } else if (!target && openRef !== null) {
    setOpenRef(null);
  }

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (target && !element.open) element.showModal();
    if (!target && element.open) element.close();
  }, [target]);

  function submit() {
    if (!target) return;
    save.mutate(
      { ref: target.ref, tags: draft },
      {
        onSuccess: onClose,
        onError: (error) => toast("danger", error instanceof DmError ? error.message : "Could not save the tags."),
      },
    );
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onCancel={(event) => {
        if (save.isPending) event.preventDefault();
      }}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-3xl border border-border bg-surface p-0 text-text shadow-2xl"
    >
      {target ? (
        <form
          method="dialog"
          className="p-6"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <h2 className="text-lg font-semibold">Tags</h2>
          <p className="mt-1 truncate text-sm text-muted" title={target.title}>
            {target.title}
          </p>
          <div className="mt-4">
            <TagInput value={draft} onChange={setDraft} suggestions={suggestions} disabled={save.isPending} autoFocus />
            <p className="mt-1.5 text-xs text-faint">Separate tags with a comma. Up to {MAX_TAGS} tags.</p>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" busy={save.isPending}>
              Save tags
            </Button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
}
