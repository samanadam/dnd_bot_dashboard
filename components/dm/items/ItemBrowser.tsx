"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Gem, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Providers";
import { Badge, Button, EmptyState, Notice, inputBaseClass, inputClass } from "@/components/ui";
import { useCampaignSelection } from "@/lib/campaign/useSelection";
import { dm, DmError } from "@/lib/dm/client";
import type { ItemSearchResult } from "@/lib/dm/itemRoutes";
import type { CustomItem } from "@/lib/dm/items";
import { ItemBlockView, RarityBadge } from "./ItemBlockView";
import { ItemForm } from "./ItemForm";

const PAGE = 40;

type Source = "all" | "custom" | "2024" | "2014";
const SOURCES: { value: Source; label: string }[] = [
  { value: "all", label: "All" },
  { value: "custom", label: "Mine" },
  { value: "2024", label: "SRD 2024" },
  { value: "2014", label: "SRD 2014" },
];

export const ITEMS_KEY = ["dm", "items"] as const;

function keyOf(result: ItemSearchResult): string {
  return result.ref.source === "srd" ? `${result.ref.edition}/${result.ref.slug}` : result.ref.id;
}

/** The body of an opened row: fetched when first shown, so the list itself stays light. */
function ItemDetail({ result, onEdit, onDelete }: { result: ItemSearchResult; onEdit: (item: CustomItem) => void; onDelete: (item: CustomItem) => void }) {
  const { ref } = result;
  const query = useQuery({
    queryKey: [...ITEMS_KEY, "detail", keyOf(result)],
    queryFn: () => (ref.source === "srd" ? dm.getSrdItem(ref.edition, ref.slug) : dm.getItem(ref.id)),
    staleTime: 60_000,
  });
  if (query.isPending) return <p className="text-sm text-muted">Loading…</p>;
  if (query.isError) return <Notice tone="danger">Could not load this item.</Notice>;
  return (
    <div className="space-y-3">
      <ItemBlockView item={query.data} />
      {ref.source === "custom" ? (
        <div className="flex gap-2">
          <Button size="sm" icon={Pencil} onClick={() => onEdit(query.data as CustomItem)}>
            Edit
          </Button>
          <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => onDelete(query.data as CustomItem)}>
            Delete
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ItemBrowser() {
  const toast = useToast();
  const client = useQueryClient();
  const [campaign] = useCampaignSelection();
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<Source>("all");
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<CustomItem | null>(null);
  const [busy, setBusy] = useState(false);
  const deferred = useDeferredValue(query);

  const scope = campaign ?? undefined;
  const results = useQuery({
    queryKey: [...ITEMS_KEY, "search", deferred, source, category, limit, scope ?? "all"],
    queryFn: () => dm.searchItems({ q: deferred, source, category, limit, campaign: scope }),
    placeholderData: (previous) => previous,
  });

  const refresh = () => client.invalidateQueries({ queryKey: ITEMS_KEY });

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-3xl border border-border bg-surface p-3 shadow-card sm:p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <label htmlFor="item-search" className="sr-only">
            Search items
          </label>
          <input
            id="item-search"
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
            className={`${inputBaseClass} h-9 max-w-52`}
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
          <span className="ml-auto text-xs tabular-nums text-muted">{results.data ? `${results.data.total} item${results.data.total === 1 ? "" : "s"}` : ""}</span>
          <Button variant="primary" size="sm" icon={Plus} onClick={() => setEditing("new")}>
            New item
          </Button>
        </div>
      </div>

      {editing ? (
        <ItemForm
          key={editing === "new" ? "new" : editing.id}
          item={editing === "new" ? undefined : editing}
          defaultCampaign={campaign && campaign !== "unassigned" ? campaign : null}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refresh();
          }}
        />
      ) : null}

      {results.isError ? <Notice tone="danger">Could not load items.</Notice> : null}
      {results.data && results.data.total === 0 ? (
        <div className="rounded-3xl border border-dashed border-border py-6">
          <EmptyState icon={Gem} title="No item matches">
            Change the search, or add your own with New item.
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
                  <span className="block truncate text-xs text-muted">{result.category || "Uncategorised"}</span>
                </span>
                <RarityBadge rarity={result.rarity} />
                {result.attunement ? <Badge>Attunement</Badge> : null}
                <Badge tone={result.ref.source === "custom" ? "accent" : "neutral"}>{result.ref.source === "custom" ? "Mine" : `SRD ${result.ref.edition}`}</Badge>
                <ChevronDown className={`size-4 shrink-0 text-faint transition ${expanded ? "rotate-180" : ""}`} aria-hidden />
              </button>
              {expanded ? (
                <div className="border-t border-border bg-bg/30 px-5 py-4">
                  <ItemDetail result={result} onEdit={(item) => setEditing(item)} onDelete={(item) => setDeleting(item)} />
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
        title={`Delete ${deleting?.name ?? "item"}?`}
        confirmLabel="Delete"
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          try {
            await dm.deleteItem(deleting.id);
            toast("ok", "Item deleted.");
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
        <p>Rewards that name it stay in their areas and show it as missing.</p>
      </ConfirmDialog>

      <p className="text-xs text-faint">SRD 5.1 and 5.2 content by Wizards of the Coast LLC, licensed under CC-BY-4.0.</p>
    </div>
  );
}
