"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, ChevronDown, Copy, Pencil, Plus, Save, Search, Share2, Trash2, X } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { CampaignSelect } from "@/components/CampaignSelect";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Providers";
import { Badge, Button, EmptyState, Field, Notice, inputBaseClass, inputClass } from "@/components/ui";
import { useCampaignSelection, useDmDefaultCampaign } from "@/lib/campaign/useSelection";
import { dm, DmError } from "@/lib/dm/client";
import { customFeatSchema, type CustomFeat, type CustomFeatInput, type FeatBlock } from "@/lib/dm/feats";
import type { FeatSearchResult } from "@/lib/dm/spellSearch";
import { RichText } from "../RichText";

const PAGE = 40;
const CATEGORIES = ["General", "Origin", "Fighting Style", "Epic Boon"];
export const FEATS_KEY = ["dm", "feats"] as const;

type Source = "all" | "custom" | "2024" | "2014";
const SOURCES: { value: Source; label: string }[] = [
  { value: "all", label: "All" },
  { value: "custom", label: "Custom" },
  { value: "2024", label: "SRD 2024" },
  { value: "2014", label: "SRD 2014" },
];

export function FeatBlockView({ feat }: { feat: FeatBlock }) {
  const facts = [feat.category, feat.prerequisite ? `Prerequisite: ${feat.prerequisite}` : "", feat.repeatable ? "Repeatable" : ""].filter(Boolean);
  return (
    <div className="space-y-2 text-sm">
      {facts.length ? <p className="text-xs text-muted">{facts.join(" · ")}</p> : null}
      {feat.description ? <RichText text={feat.description} /> : <p className="text-muted">No description.</p>}
    </div>
  );
}

const EMPTY: CustomFeatInput = { name: "", category: "General", prerequisite: "", repeatable: false, description: "" };

export function FeatForm({
  feat,
  seed,
  defaultCampaign,
  onSaved,
  onCancel,
}: {
  feat?: CustomFeat;
  seed?: FeatBlock;
  defaultCampaign: string | null;
  onSaved: (saved: CustomFeat) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [value, setValue] = useState<CustomFeatInput>(
    feat
      ? { name: feat.name, category: feat.category, prerequisite: feat.prerequisite, repeatable: feat.repeatable, description: feat.description }
      : seed
        ? { ...seed, name: `${seed.name} (house)` }
        : EMPTY,
  );
  const [campaignId, setCampaignId] = useState<string | null>(feat ? feat.campaignId : defaultCampaign);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof CustomFeatInput>(key: K, next: CustomFeatInput[K]) => setValue((current) => ({ ...current, [key]: next }));

  async function save() {
    const parsed = customFeatSchema.safeParse({ ...value, campaignId });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(`${issue?.path.join(".") || "feat"}: ${issue?.message ?? "invalid"}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = feat ? await dm.updateFeat(feat.id, parsed.data) : await dm.createFeat(parsed.data);
      toast("ok", feat ? "Feat saved." : "Feat added.");
      onSaved(saved);
    } catch (caught) {
      setError(caught instanceof DmError ? caught.message : "Could not save the feat.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-4 rounded-3xl border border-accent/40 bg-surface p-4 shadow-card sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input className={inputClass} value={value.name} maxLength={120} onChange={(event) => set("name", event.target.value)} autoFocus />
        </Field>
        <Field label="Category">
          <input className={inputClass} list="feat-categories" value={value.category} maxLength={40} onChange={(event) => set("category", event.target.value)} />
          <datalist id="feat-categories">
            {CATEGORIES.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </Field>
        <Field label="Prerequisite" hint="Leave empty when there is none.">
          <input className={inputClass} value={value.prerequisite} maxLength={200} onChange={(event) => set("prerequisite", event.target.value)} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-3 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={value.repeatable} onChange={(event) => set("repeatable", event.target.checked)} />
          Can be taken more than once
        </label>
      </div>
      <Field label="Description" hint="**bold**, _italic_ and lines starting with - work.">
        <textarea className={`${inputBaseClass} min-h-28 w-full py-2.5`} value={value.description} maxLength={20_000} onChange={(event) => set("description", event.target.value)} />
      </Field>
      <Field label="Campaign">
        <CampaignSelect dmScoped value={campaignId} onChange={setCampaignId} label="Campaign" noneLabel="Not in a campaign" />
      </Field>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex justify-end gap-2">
        <Button icon={X} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" icon={Save} busy={busy} disabled={!value.name.trim()}>
          {feat ? "Save feat" : "Add feat"}
        </Button>
      </div>
    </form>
  );
}

function keyOf(result: FeatSearchResult): string {
  return result.ref.source === "srd" ? `${result.ref.edition}/${result.ref.slug}` : result.ref.id;
}

function FeatDetail({
  result,
  onEdit,
  onDuplicate,
  onDelete,
  onShare,
}: {
  result: FeatSearchResult;
  onEdit: (feat: CustomFeat) => void;
  onDuplicate: (feat: FeatBlock) => void;
  onDelete: (feat: CustomFeat) => void;
  onShare: (feat: CustomFeat) => void;
}) {
  const { ref } = result;
  const query = useQuery({
    queryKey: [...FEATS_KEY, "detail", keyOf(result)],
    queryFn: () => (ref.source === "srd" ? dm.getSrdFeat(ref.edition, ref.slug) : dm.getFeat(ref.id)),
    staleTime: 60_000,
  });
  if (query.isPending) return <p className="text-sm text-muted">Loading…</p>;
  if (query.isError) return <Notice tone="danger">Could not load this feat.</Notice>;
  const custom = ref.source === "custom" ? (query.data as CustomFeat) : null;
  return (
    <div className="space-y-3">
      <FeatBlockView feat={query.data} />
      <div className="flex flex-wrap gap-2">
        {custom ? (
          <>
            <Button size="sm" icon={Pencil} onClick={() => onEdit(custom)}>
              Edit
            </Button>
            {custom.authorUserId ? (
              <Button size="sm" icon={Share2} onClick={() => onShare(custom)}>
                {custom.shared ? "Make private" : "Share with campaign"}
              </Button>
            ) : null}
            <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => onDelete(custom)}>
              Delete
            </Button>
          </>
        ) : (
          <Button size="sm" icon={Copy} onClick={() => onDuplicate(query.data)}>
            Duplicate as custom
          </Button>
        )}
      </div>
    </div>
  );
}

export function FeatBrowser() {
  const toast = useToast();
  const client = useQueryClient();
  const [campaign] = useCampaignSelection();
  const defaultCampaign = useDmDefaultCampaign();
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<Source>("all");
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ feat?: CustomFeat; seed?: FeatBlock } | null>(null);
  const [deleting, setDeleting] = useState<CustomFeat | null>(null);
  const [busy, setBusy] = useState(false);
  const deferred = useDeferredValue(query);

  const params = { q: deferred, source, category: category || undefined, limit, campaign: campaign ?? undefined };
  const results = useQuery({
    queryKey: [...FEATS_KEY, "search", params],
    queryFn: () => dm.searchFeats(params),
    placeholderData: (previous) => previous,
  });
  const refresh = () => client.invalidateQueries({ queryKey: FEATS_KEY });

  async function share(feat: CustomFeat) {
    try {
      await dm.shareFeat(feat.id, !feat.shared);
      toast("ok", feat.shared ? "Feat made private." : "Feat shared with the campaign.");
      await refresh();
    } catch (error) {
      toast("danger", error instanceof DmError ? error.message : "Could not change sharing.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-3xl border border-border bg-surface p-3 shadow-card sm:p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <label htmlFor="feat-search" className="sr-only">
            Search feats
          </label>
          <input
            id="feat-search"
            type="search"
            className={`${inputClass} pl-10`}
            placeholder="Search by name"
            value={query}
            maxLength={80}
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(PAGE);
            }}
          />
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
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${source === option.value ? "bg-surface-3 text-text shadow-card" : "text-muted hover:text-text"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <select
            aria-label="Category"
            className={`${inputBaseClass} h-9`}
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setLimit(PAGE);
            }}
          >
            <option value="">Any category</option>
            {(results.data?.categories ?? []).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <span className="ml-auto text-xs tabular-nums text-muted">{results.data ? `${results.data.total} feat${results.data.total === 1 ? "" : "s"}` : ""}</span>
          <Button variant="primary" size="sm" icon={Plus} onClick={() => setEditing({})}>
            New feat
          </Button>
        </div>
      </div>

      {editing ? (
        <FeatForm
          key={editing.feat?.id ?? (editing.seed ? `seed-${editing.seed.name}` : "new")}
          feat={editing.feat}
          seed={editing.seed}
          defaultCampaign={defaultCampaign}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refresh();
          }}
        />
      ) : null}

      {results.isError ? <Notice tone="danger">Could not load feats.</Notice> : null}
      {results.data && results.data.total === 0 ? (
        <div className="rounded-3xl border border-dashed border-border py-6">
          <EmptyState icon={Award} title="No feat matches">
            Change the search, or add your own with New feat.
          </EmptyState>
        </div>
      ) : null}

      <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-surface shadow-card empty:hidden">
        {(results.data?.results ?? []).map((result) => {
          const key = keyOf(result);
          const expanded = open === key;
          return (
            <li key={key}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : key)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{result.name}</span>
                  <span className="block truncate text-xs text-muted">{[result.category, result.prerequisite].filter(Boolean).join(" · ") || "No prerequisite"}</span>
                </span>
                {result.author === "player" ? <Badge tone="ok">Homebrew</Badge> : null}
                <Badge tone={result.ref.source === "custom" ? "accent" : "neutral"}>{result.ref.source === "custom" ? "Custom" : `SRD ${result.ref.edition}`}</Badge>
                <ChevronDown className={`size-4 shrink-0 text-faint transition ${expanded ? "rotate-180" : ""}`} aria-hidden />
              </button>
              {expanded ? (
                <div className="border-t border-border bg-bg/30 px-5 py-4">
                  <FeatDetail
                    result={result}
                    onEdit={(feat) => setEditing({ feat })}
                    onDuplicate={(seed) => setEditing({ seed })}
                    onDelete={(feat) => setDeleting(feat)}
                    onShare={(feat) => void share(feat)}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {results.data && results.data.results.length < results.data.total ? (
        <div className="flex justify-center">
          <Button onClick={() => setLimit((current) => current + PAGE)} busy={results.isFetching}>
            Show more
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "feat"}?`}
        confirmLabel="Delete"
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          try {
            await dm.deleteFeat(deleting.id);
            toast("ok", "Feat deleted.");
            setOpen(null);
            await refresh();
          } catch (error) {
            toast("danger", error instanceof DmError ? error.message : "Could not delete.");
          } finally {
            setBusy(false);
            setDeleting(null);
          }
        }}
      >
        <p>Character sheets that list it will show it as a missing feat.</p>
      </ConfirmDialog>
    </div>
  );
}
