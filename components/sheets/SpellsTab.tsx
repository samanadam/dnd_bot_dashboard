"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, ChevronDown, Plus, Search, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { SpellBlockView } from "@/components/dm/spells/SpellBlockView";
import { SpellForm } from "@/components/dm/spells/SpellForm";
import { Badge, Button, EmptyState, Notice, inputBaseClass, inputClass } from "@/components/ui";
import type { SpellRef } from "@/lib/dm/spells";
import type { SpellBlock } from "@/lib/dm/spells";
import type { SpellEntry } from "@/lib/sheets/body";
import { refKeyOf, sheets } from "@/lib/sheets/client";
import { scaledRoll } from "@/lib/sheets/derive";
import { ABILITY_NAMES } from "@/lib/sheets/rules";
import { newLocalId, Pips, Section, signed } from "./bits";
import { useRoller } from "./Roller";
import type { SheetHandle } from "./useSheet";

const levelName = (level: number) => (level === 0 ? "Cantrips" : `Level ${level}`);

function CastDialog({ sheet, spell, entry, onClose }: { sheet: SheetHandle; spell: SpellBlock; entry: SpellEntry; onClose: () => void }) {
  const { derived, vitals, apply } = sheet;
  const { roll } = useRoller();
  const options: { value: string; label: string; level: number }[] = [];
  if (spell.level > 0) {
    for (let level = spell.level; level <= 9; level++) if (derived.slotsLeft[level - 1] > 0) options.push({ value: String(level), label: `Level ${level} slot (${derived.slotsLeft[level - 1]} left)`, level });
    if (derived.pact.left > 0 && derived.pact.level >= spell.level) options.push({ value: "pact", label: `Pact Magic, level ${derived.pact.level} (${derived.pact.left} left)`, level: derived.pact.level });
    if (spell.ritual) options.push({ value: "ritual", label: "As a ritual (no slot, 10 minutes longer)", level: spell.level });
  }
  options.push({ value: "free", label: spell.level === 0 ? "Cantrip" : "Without a slot (an item or feature)", level: spell.level });
  const [choice, setChoice] = useState(options[0].value);
  const [busy, setBusy] = useState(false);
  const picked = options.find((o) => o.value === choice) ?? options[0];
  const effect = scaledRoll(spell, picked.level, derived.totalLevel);
  const casting = derived.casting.find((c) => c.classId === entry.classId) ?? derived.casting[0];
  const replaces = spell.concentration && vitals.concentration && vitals.concentration.name !== spell.name ? vitals.concentration.name : null;

  async function cast() {
    setBusy(true);
    const slot = choice === "pact" || choice === "ritual" || choice === "free" ? choice : Number(choice);
    const ok = await apply([{ op: "cast", spellRef: entry.ref, slot: slot as never }]);
    setBusy(false);
    if (!ok) return;
    if (spell.attack && casting) await roll(`1d20${signed(casting.attack)}`, `${spell.name} attack`);
    if (effect) await roll(effect, `${spell.name} ${spell.effect?.kind === "healing" ? "healing" : "damage"}`);
    onClose();
  }

  return (
    <div className="space-y-3 rounded-2xl border border-accent/40 bg-accent-soft/30 p-3">
      <div className="flex items-center justify-between">
        <p className="font-medium">Cast {spell.name}</p>
        <Button size="icon" variant="ghost" icon={X} aria-label="Cancel" onClick={onClose} />
      </div>
      <select aria-label="How to cast it" className={`${inputBaseClass} h-10 w-full`} value={choice} onChange={(event) => setChoice(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ul className="space-y-1 text-sm">
        {spell.save && casting ? (
          <li>
            Targets make a {ABILITY_NAMES[spell.save]} save against DC <strong>{casting.dc}</strong>.
          </li>
        ) : null}
        {spell.attack && casting ? <li>Spell attack {signed(casting.attack)} is rolled for you.</li> : null}
        {effect ? (
          <li>
            {spell.effect?.kind === "healing" ? "Heals" : "Deals"} <span className="font-mono">{effect}</span>
            {spell.effect?.types.length ? ` ${spell.effect.types.join("/")}` : ""}.
          </li>
        ) : null}
        {replaces ? <li className="text-warn">This ends your concentration on {replaces}.</li> : null}
      </ul>
      <div className="flex justify-end">
        <Button variant="primary" icon={Wand2} busy={busy} onClick={() => void cast()} disabled={spell.level > 0 && options.length === 1 && choice !== "free"}>
          Cast
        </Button>
      </div>
    </div>
  );
}

function SpellPicker({ sheet, onPick, onClose }: { sheet: SheetHandle; onPick: (ref: SpellRef) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("");
  const deferred = useDeferredValue(q);
  const casterClasses = sheet.derived.casting.map((c) => c.name);
  const [className, setClassName] = useState(casterClasses[0] ?? "");
  const results = useQuery({
    queryKey: ["sheet", sheet.view.id, "spell-search", deferred, level, className],
    queryFn: () => sheets.searchSpells(sheet.view.id, { q: deferred, level: level || undefined, class: className || undefined, limit: 30 }),
    placeholderData: (previous) => previous,
  });
  const have = new Set(sheet.body.spellcasting.entries.map((e) => refKeyOf(e.ref)));
  return (
    <div className="space-y-2 rounded-2xl border border-border bg-bg/40 p-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <input aria-label="Search spells" className={`${inputClass} pl-9`} value={q} maxLength={80} placeholder="Search spells" onChange={(event) => setQ(event.target.value)} autoFocus />
        </div>
        <select aria-label="Level" className={`${inputBaseClass} h-11`} value={level} onChange={(event) => setLevel(event.target.value)}>
          <option value="">Any level</option>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => (
            <option key={l} value={l}>
              {levelName(l)}
            </option>
          ))}
        </select>
        <select aria-label="Class list" className={`${inputBaseClass} h-11`} value={className} onChange={(event) => setClassName(event.target.value)}>
          <option value="">Any class</option>
          {(results.data?.classes ?? casterClasses).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <Button icon={X} onClick={onClose}>
          Done
        </Button>
      </div>
      <ul className="max-h-72 divide-y divide-border overflow-y-auto">
        {(results.data?.results ?? []).map((result) => {
          const key = refKeyOf(result.ref);
          return (
            <li key={key} className="flex items-center gap-2 py-2 text-sm">
              <span className="w-6 text-center text-xs text-muted">{result.level === 0 ? "C" : result.level}</span>
              <span className="min-w-0 flex-1 truncate">{result.name}</span>
              {result.ref.source === "custom" ? <Badge tone="accent">{result.author === "player" ? "Homebrew" : "Custom"}</Badge> : null}
              <Button size="sm" icon={Plus} disabled={have.has(key)} onClick={() => onPick(result.ref)}>
                {have.has(key) ? "Added" : "Add"}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SpellsTab({ sheet, editing, campaignId }: { sheet: SheetHandle; editing: boolean; campaignId: string }) {
  const { body, derived, update, apply, view } = sheet;
  const client = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [casting, setCasting] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [writing, setWriting] = useState(false);
  const { roll } = useRoller();

  const keys = body.spellcasting.entries.map((e) => refKeyOf(e.ref));
  const blocks = useQuery({
    queryKey: ["sheet", view.id, "resolve", [...keys].sort().join(",")],
    queryFn: () => sheets.resolve(view.id, keys, []),
    enabled: keys.length > 0,
    staleTime: 60_000,
  });
  const spellOf = (entry: SpellEntry) => blocks.data?.spells[refKeyOf(entry.ref)] ?? null;

  const grouped = new Map<number, SpellEntry[]>();
  for (const entry of body.spellcasting.entries) {
    const level = spellOf(entry)?.level ?? 99;
    grouped.set(level, [...(grouped.get(level) ?? []), entry]);
  }
  const levels = [...grouped.keys()].sort((a, b) => a - b);
  const hasSlots = derived.slots.some((n) => n > 0) || derived.pact.count > 0;

  const add = (ref: SpellRef) =>
    update((b) => ({
      ...b,
      spellcasting: { ...b.spellcasting, entries: [...b.spellcasting.entries, { id: newLocalId(), ref, classId: derived.casting[0]?.classId ?? null, status: "known", notes: "" }] },
    }));

  return (
    <div className="space-y-4">
      {derived.casting.length === 0 ? (
        <Notice tone="neutral">None of this character&apos;s classes casts spells. Set a class&apos;s casting type under editing to use this tab, or keep spells from items and feats here anyway.</Notice>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {derived.casting.map((c) => (
            <div key={c.classId} className="rounded-2xl border border-border bg-surface p-3 text-sm shadow-card">
              <p className="font-medium">{c.name}</p>
              <p className="text-muted">
                {ABILITY_NAMES[c.ability]} · save DC <strong className="text-text">{c.dc}</strong> · attack{" "}
                <button type="button" className="font-semibold text-text hover:text-accent" onClick={() => void roll(`1d20${signed(c.attack)}`, `${c.name} spell attack`)}>
                  {signed(c.attack)}
                </button>
              </p>
              {c.preparedMax !== null ? (
                <p className={c.prepared > c.preparedMax ? "text-warn" : "text-muted"}>
                  Prepared {c.prepared} of {c.preparedMax}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {hasSlots ? (
        <Section title="Spell slots">
          <ul className="space-y-2">
            {derived.slots.map((total, index) =>
              total > 0 ? (
                <li key={index} className="flex items-center gap-3 text-sm">
                  <span className="w-16 text-muted">Level {index + 1}</span>
                  <Pips
                    total={total}
                    left={derived.slotsLeft[index]}
                    label={`level ${index + 1} slot`}
                    onSpend={() => void apply([{ op: "spendSlot", level: index + 1 }])}
                    onRestore={() => void apply([{ op: "restoreSlot", level: index + 1 }])}
                  />
                </li>
              ) : null,
            )}
            {derived.pact.count > 0 ? (
              <li className="flex items-center gap-3 text-sm">
                <span className="w-16 text-muted">Pact {derived.pact.level}</span>
                <Pips total={derived.pact.count} left={derived.pact.left} label="Pact Magic slot" onSpend={() => void apply([{ op: "spendPact" }])} onRestore={() => void apply([{ op: "restorePact" }])} />
              </li>
            ) : null}
          </ul>
        </Section>
      ) : null}

      <Section
        title="Spells"
        action={
          <div className="flex gap-2">
            <Button size="sm" icon={Plus} onClick={() => setPicking((v) => !v)}>
              Add spells
            </Button>
            <Button size="sm" icon={Sparkles} onClick={() => setWriting((v) => !v)}>
              Homebrew
            </Button>
          </div>
        }
      >
        {picking ? <SpellPicker sheet={sheet} onPick={add} onClose={() => setPicking(false)} /> : null}
        {writing ? (
          <SpellForm
            defaultCampaign={campaignId}
            fixedCampaign
            submit={(input) => sheets.createHomebrewSpell({ ...input, campaignId })}
            onCancel={() => setWriting(false)}
            onSaved={(saved) => {
              setWriting(false);
              add({ source: "custom", id: saved.id });
              void client.invalidateQueries({ queryKey: ["sheet", view.id] });
            }}
          />
        ) : null}
        {body.spellcasting.entries.length === 0 ? (
          <EmptyState icon={BookOpen} title="No spells yet">
            Add them from the SRD, your DM&apos;s spells, or your own homebrew.
          </EmptyState>
        ) : (
          <div className="space-y-4">
            {levels.map((level) => (
              <div key={level}>
                <h3 className="mb-1 text-xs font-semibold uppercase text-muted">{level === 99 ? "Missing" : levelName(level)}</h3>
                <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
                  {grouped.get(level)!.map((entry) => {
                    const spell = spellOf(entry);
                    const expanded = open === entry.id;
                    return (
                      <li key={entry.id} className="bg-surface">
                        <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                          <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : entry.id)}>
                            <span className={`truncate font-medium ${spell ? "" : "text-danger"}`}>{spell?.name ?? (blocks.isPending ? "Loading…" : "Missing spell")}</span>
                            {spell?.concentration ? <Badge tone="warn">C</Badge> : null}
                            {spell?.ritual ? <Badge>R</Badge> : null}
                            <ChevronDown className={`size-4 shrink-0 text-faint transition ${expanded ? "rotate-180" : ""}`} aria-hidden />
                          </button>
                          {level > 0 && level !== 99 ? (
                            <select
                              aria-label="Status"
                              className={`${inputBaseClass} h-8 text-xs`}
                              value={entry.status}
                              onChange={(event) =>
                                update((b) => ({ ...b, spellcasting: { ...b.spellcasting, entries: b.spellcasting.entries.map((e) => (e.id === entry.id ? { ...e, status: event.target.value as SpellEntry["status"] } : e)) } }))
                              }
                            >
                              <option value="known">Known</option>
                              <option value="prepared">Prepared</option>
                              <option value="always">Always prepared</option>
                            </select>
                          ) : null}
                          {spell ? (
                            <Button size="sm" variant="primary" icon={Wand2} onClick={() => setCasting(casting === entry.id ? null : entry.id)}>
                              Cast
                            </Button>
                          ) : null}
                          {editing ? (
                            <Button
                              size="icon"
                              variant="danger-ghost"
                              icon={Trash2}
                              aria-label="Remove spell"
                              onClick={() => update((b) => ({ ...b, spellcasting: { ...b.spellcasting, entries: b.spellcasting.entries.filter((e) => e.id !== entry.id) } }))}
                            />
                          ) : null}
                        </div>
                        {casting === entry.id && spell ? (
                          <div className="px-3 pb-3">
                            <CastDialog sheet={sheet} spell={spell} entry={entry} onClose={() => setCasting(null)} />
                          </div>
                        ) : null}
                        {expanded && spell ? (
                          <div className="border-t border-border bg-bg/30 px-4 py-3">
                            <SpellBlockView spell={spell} />
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
