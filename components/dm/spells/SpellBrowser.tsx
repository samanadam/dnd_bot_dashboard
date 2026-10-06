"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Copy, Pencil, Plus, Search, Share2, Sparkles, Trash2 } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Providers";
import { Badge, Button, EmptyState, Notice, inputBaseClass, inputClass } from "@/components/ui";
import { useCampaignSelection, useDmDefaultCampaign } from "@/lib/campaign/useSelection";
import { dm, DmError } from "@/lib/dm/client";
import type { SpellSearchResult } from "@/lib/dm/spellSearch";
import { SCHOOLS, type CustomSpell, type SpellBlock } from "@/lib/dm/spells";
import { SpellBlockView } from "./SpellBlockView";
import { SpellForm } from "./SpellForm";

const PAGE = 40;

type Source = "all" | "custom" | "2024" | "2014";
const SOURCES: { value: Source; label: string }[] = [
  { value: "all", label: "All" },
  { value: "custom", label: "Custom" },
  { value: "2024", label: "SRD 2024" },
  { value: "2014", label: "SRD 2014" },
];
type Tri = "" | "true" | "false";

export const SPELLS_KEY = ["dm", "spells"] as const;

const capital = (text: string) => text[0].toUpperCase() + text.slice(1);

function keyOf(result: SpellSearchResult): string {
  return result.ref.source === "srd" ? `${result.ref.edition}/${result.ref.slug}` : result.ref.id;
}

function SpellDetail({
  result,
  onEdit,
  onDuplicate,
  onDelete,
  onShare,
}: {
  result: SpellSearchResult;
  onEdit: (spell: CustomSpell) => void;
  onDuplicate: (spell: SpellBlock) => void;
  onDelete: (spell: CustomSpell) => void;
  onShare: (spell: CustomSpell) => void;
}) {
  const { ref } = result;
  const query = useQuery({
    queryKey: [...SPELLS_KEY, "detail", keyOf(result)],
    queryFn: () => (ref.source === "srd" ? dm.getSrdSpell(ref.edition, ref.slug) : dm.getSpell(ref.id)),
    staleTime: 60_000,
  });
  if (query.isPending) return <p className="text-sm text-muted">Loading…</p>;
  if (query.isError) return <Notice tone="danger">Could not load this spell.</Notice>;
  const custom = ref.source === "custom" ? (query.data as CustomSpell) : null;
  return (
    <div className="space-y-3">
      <SpellBlockView spell={query.data} />
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

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${active ? "bg-surface-3 text-text shadow-card" : "text-muted hover:text-text"}`}
    >
      {children}
    </button>
  );
}

export function SpellBrowser() {
  const toast = useToast();
  const client = useQueryClient();
  const [campaign] = useCampaignSelection();
  const defaultCampaign = useDmDefaultCampaign();
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<Source>("all");
  const [levels, setLevels] = useState<number[]>([]);
  const [school, setSchool] = useState("");
  const [className, setClassName] = useState("");
  const [concentration, setConcentration] = useState<Tri>("");
  const [ritual, setRitual] = useState<Tri>("");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ spell?: CustomSpell; seed?: SpellBlock } | null>(null);
  const [deleting, setDeleting] = useState<CustomSpell | null>(null);
  const [busy, setBusy] = useState(false);
  const deferred = useDeferredValue(query);

  const scope = campaign ?? undefined;
  const params = {
    q: deferred,
    source,
    level: levels.length ? [...levels].sort().join(",") : undefined,
    school: school || undefined,
    class: className || undefined,
    concentration: concentration || undefined,
    ritual: ritual || undefined,
    limit,
    campaign: scope,
  };
  const results = useQuery({
    queryKey: [...SPELLS_KEY, "search", params],
    queryFn: () => dm.searchSpells(params),
    placeholderData: (previous) => previous,
  });

  const refresh = () => client.invalidateQueries({ queryKey: SPELLS_KEY });
  const reset = () => setLimit(PAGE);
  const toggleLevel = (level: number) => {
    setLevels((current) => (current.includes(level) ? current.filter((l) => l !== level) : [...current, level]));
    reset();
  };

  async function share(spell: CustomSpell) {
    try {
      await dm.shareSpell(spell.id, !spell.shared);
      toast("ok", spell.shared ? "Spell made private." : "Spell shared with the campaign.");
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
          <label htmlFor="spell-search" className="sr-only">
            Search spells
          </label>
          <input
            id="spell-search"
            type="search"
            className={`${inputClass} pl-10`}
            placeholder="Search by name"
            value={query}
            maxLength={80}
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.target.value);
              reset();
            }}
          />
        </div>
        <div role="group" aria-label="Level" className="flex flex-wrap gap-1 rounded-xl border border-border bg-bg/40 p-1">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => (
            <Chip key={level} active={levels.includes(level)} onClick={() => toggleLevel(level)}>
              {level === 0 ? "Cantrip" : level}
            </Chip>
          ))}
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
                  reset();
                }}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${source === option.value ? "bg-surface-3 text-text shadow-card" : "text-muted hover:text-text"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <select aria-label="School" className={`${inputBaseClass} h-9`} value={school} onChange={(event) => {
            setSchool(event.target.value);
            reset();
          }}>
            <option value="">Any school</option>
            {SCHOOLS.map((name) => (
              <option key={name} value={name}>
                {capital(name)}
              </option>
            ))}
          </select>
          <select aria-label="Class" className={`${inputBaseClass} h-9`} value={className} onChange={(event) => {
            setClassName(event.target.value);
            reset();
          }}>
            <option value="">Any class</option>
            {(results.data?.classes ?? []).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select aria-label="Concentration" className={`${inputBaseClass} h-9`} value={concentration} onChange={(event) => {
            setConcentration(event.target.value as Tri);
            reset();
          }}>
            <option value="">Concentration: any</option>
            <option value="true">Concentration</option>
            <option value="false">No concentration</option>
          </select>
          <select aria-label="Ritual" className={`${inputBaseClass} h-9`} value={ritual} onChange={(event) => {
            setRitual(event.target.value as Tri);
            reset();
          }}>
            <option value="">Ritual: any</option>
            <option value="true">Ritual</option>
            <option value="false">Not a ritual</option>
          </select>
          <span className="ml-auto text-xs tabular-nums text-muted">{results.data ? `${results.data.total} spell${results.data.total === 1 ? "" : "s"}` : ""}</span>
          <Button variant="primary" size="sm" icon={Plus} onClick={() => setEditing({})}>
            New spell
          </Button>
        </div>
      </div>

      {editing ? (
        <SpellForm
          key={editing.spell?.id ?? (editing.seed ? `seed-${editing.seed.name}` : "new")}
          spell={editing.spell}
          seed={editing.seed}
          defaultCampaign={defaultCampaign}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refresh();
          }}
        />
      ) : null}

      {results.isError ? <Notice tone="danger">Could not load spells.</Notice> : null}
      {results.data && results.data.total === 0 ? (
        <div className="rounded-3xl border border-dashed border-border py-6">
          <EmptyState icon={Sparkles} title="No spell matches">
            Change the search or the filters, or add your own with New spell.
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
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-xs font-semibold tabular-nums" aria-label={result.level === 0 ? "Cantrip" : `Level ${result.level}`}>
                  {result.level === 0 ? "C" : result.level}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{result.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {capital(result.school)} · {result.castingTime}
                  </span>
                </span>
                {result.concentration ? <Badge tone="warn">C</Badge> : null}
                {result.ritual ? <Badge>R</Badge> : null}
                {result.author === "player" ? <Badge tone="ok">Homebrew</Badge> : null}
                <Badge tone={result.ref.source === "custom" ? "accent" : "neutral"}>{result.ref.source === "custom" ? "Custom" : `SRD ${result.ref.edition}`}</Badge>
                <ChevronDown className={`size-4 shrink-0 text-faint transition ${expanded ? "rotate-180" : ""}`} aria-hidden />
              </button>
              {expanded ? (
                <div className="border-t border-border bg-bg/30 px-5 py-4">
                  <SpellDetail
                    result={result}
                    onEdit={(spell) => setEditing({ spell })}
                    onDuplicate={(seed) => setEditing({ seed })}
                    onDelete={(spell) => setDeleting(spell)}
                    onShare={(spell) => void share(spell)}
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
        title={`Delete ${deleting?.name ?? "spell"}?`}
        confirmLabel="Delete"
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          try {
            await dm.deleteSpell(deleting.id);
            toast("ok", "Spell deleted.");
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
        <p>Character sheets that list it will show it as a missing spell.</p>
      </ConfirmDialog>

      <p className="text-xs text-faint">SRD 5.1 and 5.2 content by Wizards of the Coast LLC, licensed under CC-BY-4.0.</p>
    </div>
  );
}
