"use client";

import { useQuery } from "@tanstack/react-query";
import { Award, Plus, Search, Trash2, X } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { RichText } from "@/components/dm/RichText";
import { Badge, Button, EmptyState, inputClass } from "@/components/ui";
import { refKeyOf, sheets } from "@/lib/sheets/client";
import { newLocalId, Section, TextArea, TextField } from "./bits";
import type { SheetHandle } from "./useSheet";

function FeatPicker({ sheet, onClose }: { sheet: SheetHandle; onClose: () => void }) {
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q);
  const results = useQuery({
    queryKey: ["sheet", sheet.view.id, "feat-search", deferred],
    queryFn: () => sheets.searchFeats(sheet.view.id, { q: deferred, limit: 30 }),
    placeholderData: (previous) => previous,
  });
  const have = new Set(sheet.body.feats.flatMap((f) => (f.ref ? [refKeyOf(f.ref)] : [])));
  return (
    <div className="space-y-2 rounded-2xl border border-border bg-bg/40 p-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <input aria-label="Search feats" className={`${inputClass} pl-9`} value={q} maxLength={80} placeholder="Search feats" onChange={(event) => setQ(event.target.value)} autoFocus />
        </div>
        <Button icon={X} onClick={onClose}>
          Done
        </Button>
      </div>
      <ul className="max-h-64 divide-y divide-border overflow-y-auto">
        {(results.data?.results ?? []).map((result) => {
          const key = refKeyOf(result.ref);
          return (
            <li key={key} className="flex items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {result.name}
                <span className="ml-2 text-xs text-muted">{[result.category, result.prerequisite].filter(Boolean).join(" · ")}</span>
              </span>
              <Button
                size="sm"
                icon={Plus}
                disabled={have.has(key)}
                onClick={async () => {
                  const blocks = await sheets.resolve(sheet.view.id, [], [key]);
                  const block = blocks.feats[key];
                  sheet.update((b) => ({
                    ...b,
                    feats: [...b.feats, { id: newLocalId(), ref: result.ref, name: result.name, source: result.category, description: block?.description ?? "", choices: "" }],
                  }));
                }}
              >
                {have.has(key) ? "Added" : "Add"}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function FeaturesTab({ sheet, editing }: { sheet: SheetHandle; editing: boolean }) {
  const { body, update } = sheet;
  const [picking, setPicking] = useState(false);

  return (
    <div className="space-y-4">
      <Section
        title="Features and traits"
        action={
          editing && body.features.length < 200 ? (
            <Button size="sm" icon={Plus} onClick={() => update((b) => ({ ...b, features: [...b.features, { id: newLocalId(), name: "New feature", source: "", description: "", resourceId: null }] }))}>
              Feature
            </Button>
          ) : null
        }
      >
        {body.features.length === 0 ? (
          <p className="text-sm text-muted">Class features, species traits and background features. Type them in from your book.</p>
        ) : (
          <ul className="space-y-3">
            {body.features.map((feature, index) => (
              <li key={feature.id} className="rounded-2xl border border-border p-3">
                {editing ? (
                  <div className="space-y-2">
                    <div className="grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
                      <TextField label="Name" value={feature.name} max={120} onChange={(name) => update((b) => ({ ...b, features: b.features.map((f, i) => (i === index ? { ...f, name: name || f.name } : f)) }))} />
                      <TextField label="From" value={feature.source} max={80} placeholder="Fighter 2" onChange={(source) => update((b) => ({ ...b, features: b.features.map((f, i) => (i === index ? { ...f, source } : f)) }))} />
                      <div className="flex items-end">
                        <Button size="icon" variant="danger-ghost" icon={Trash2} aria-label={`Remove ${feature.name}`} onClick={() => update((b) => ({ ...b, features: b.features.filter((_, i) => i !== index) }))} />
                      </div>
                    </div>
                    <TextArea label="Description" value={feature.description} max={20_000} onChange={(description) => update((b) => ({ ...b, features: b.features.map((f, i) => (i === index ? { ...f, description } : f)) }))} />
                  </div>
                ) : (
                  <>
                    <p className="font-medium">
                      {feature.name}
                      {feature.source ? <span className="ml-2 text-xs font-normal text-muted">{feature.source}</span> : null}
                    </p>
                    {feature.description ? <RichText text={feature.description} className="mt-1 text-sm" /> : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Feats"
        action={
          <div className="flex gap-2">
            <Button size="sm" icon={Search} onClick={() => setPicking((v) => !v)}>
              Find a feat
            </Button>
            {editing ? (
              <Button size="sm" icon={Plus} onClick={() => update((b) => ({ ...b, feats: [...b.feats, { id: newLocalId(), ref: null, name: "New feat", source: "", description: "", choices: "" }] }))}>
                Type one in
              </Button>
            ) : null}
          </div>
        }
      >
        {picking ? <FeatPicker sheet={sheet} onClose={() => setPicking(false)} /> : null}
        {body.feats.length === 0 ? (
          <EmptyState icon={Award} title="No feats yet" />
        ) : (
          <ul className="space-y-3">
            {body.feats.map((feat, index) => (
              <li key={feat.id} className="rounded-2xl border border-border p-3">
                {editing ? (
                  <div className="space-y-2">
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <TextField label="Name" value={feat.name} max={120} onChange={(name) => update((b) => ({ ...b, feats: b.feats.map((f, i) => (i === index ? { ...f, name: name || f.name } : f)) }))} />
                      <div className="flex items-end">
                        <Button size="icon" variant="danger-ghost" icon={Trash2} aria-label={`Remove ${feat.name}`} onClick={() => update((b) => ({ ...b, feats: b.feats.filter((_, i) => i !== index) }))} />
                      </div>
                    </div>
                    <TextField label="Choices made" value={feat.choices} max={500} placeholder="+1 Str, +1 Con" onChange={(choices) => update((b) => ({ ...b, feats: b.feats.map((f, i) => (i === index ? { ...f, choices } : f)) }))} />
                    <TextArea label="Description" value={feat.description} max={20_000} onChange={(description) => update((b) => ({ ...b, feats: b.feats.map((f, i) => (i === index ? { ...f, description } : f)) }))} />
                  </div>
                ) : (
                  <>
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {feat.name}
                      {feat.ref ? <Badge>{feat.ref.source === "srd" ? `SRD ${feat.ref.edition}` : "Custom"}</Badge> : null}
                    </p>
                    {feat.choices ? <p className="text-xs text-muted">{feat.choices}</p> : null}
                    {feat.description ? <RichText text={feat.description} className="mt-1 text-sm" /> : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
