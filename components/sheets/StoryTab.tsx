"use client";

import { Cat, Plus, Trash2 } from "lucide-react";
import { RichText } from "@/components/dm/RichText";
import { Button, EmptyState, inputBaseClass } from "@/components/ui";
import type { SheetBody } from "@/lib/sheets/body";
import { newLocalId, NumberField, Section, TextArea, TextField } from "./bits";
import type { SheetHandle } from "./useSheet";

const STORY: { key: keyof SheetBody["backstory"]; label: string; max: number; rows?: number }[] = [
  { key: "personalityTraits", label: "Personality traits", max: 5000 },
  { key: "ideals", label: "Ideals", max: 5000 },
  { key: "bonds", label: "Bonds", max: 5000 },
  { key: "flaws", label: "Flaws", max: 5000 },
  { key: "appearance", label: "Appearance", max: 5000 },
  { key: "backstory", label: "Backstory", max: 50_000, rows: 10 },
  { key: "alliesAndOrganizations", label: "Allies and organizations", max: 10_000 },
  { key: "treasure", label: "Treasure", max: 5000 },
  { key: "goals", label: "Goals", max: 5000 },
  { key: "secretsForDm", label: "Secrets only the DM may know", max: 10_000 },
];

const LOOKS: { key: keyof SheetBody["identity"]; label: string }[] = [
  { key: "age", label: "Age" },
  { key: "height", label: "Height" },
  { key: "weight", label: "Weight" },
  { key: "eyes", label: "Eyes" },
  { key: "hair", label: "Hair" },
  { key: "skin", label: "Skin" },
  { key: "pronouns", label: "Pronouns" },
  { key: "faith", label: "Faith" },
];

export function StoryTab({ sheet, editing }: { sheet: SheetHandle; editing: boolean }) {
  const { body, update } = sheet;
  return (
    <div className="space-y-4">
      <Section title="Who they are">
        {editing ? (
          <div className="grid gap-2 sm:grid-cols-4">
            {LOOKS.map(({ key, label }) => (
              <TextField key={key} label={label} value={String(body.identity[key])} max={key === "faith" ? 80 : 40} onChange={(value) => update((b) => ({ ...b, identity: { ...b.identity, [key]: value } }))} />
            ))}
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {LOOKS.filter(({ key }) => body.identity[key]).map(({ key, label }) => (
              <div key={key}>
                <dt className="text-xs text-muted">{label}</dt>
                <dd>{String(body.identity[key])}</dd>
              </div>
            ))}
          </dl>
        )}
      </Section>
      <Section title="Story">
        {STORY.map(({ key, label, max, rows }) =>
          editing ? (
            <TextArea key={key} label={label} value={body.backstory[key]} max={max} rows={rows} onChange={(value) => update((b) => ({ ...b, backstory: { ...b.backstory, [key]: value } }))} />
          ) : body.backstory[key] ? (
            <div key={key}>
              <h3 className="text-xs font-semibold uppercase text-muted">{label}</h3>
              <RichText text={body.backstory[key]} className="text-sm" />
            </div>
          ) : null,
        )}
        {!editing && STORY.every(({ key }) => !body.backstory[key]) ? <p className="text-sm text-muted">Turn on editing to write who this character is.</p> : null}
      </Section>
      <Section title="Notes">
        <TextArea label="Anything else" value={body.notes} max={50_000} rows={8} onChange={(notes) => update((b) => ({ ...b, notes }))} />
      </Section>
    </div>
  );
}

export function CompanionsTab({ sheet, editing }: { sheet: SheetHandle; editing: boolean }) {
  const { body, vitals, update, apply } = sheet;
  return (
    <Section
      title="Companions"
      action={
        editing && body.companions.length < 10 ? (
          <Button
            size="sm"
            icon={Plus}
            onClick={() => update((b) => ({ ...b, companions: [...b.companions, { id: newLocalId(), name: "New companion", kind: "familiar", ref: null, ac: 12, maxHp: 4, speed: "30 ft", attacks: [], notes: "" }] }))}
          >
            Companion
          </Button>
        ) : null
      }
    >
      {body.companions.length === 0 ? (
        <EmptyState icon={Cat} title="No companions">
          Familiars, animal companions, mounts and summons.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {body.companions.map((companion, index) => {
            const state = vitals.companions[companion.id] ?? { hp: companion.maxHp, tempHp: 0, conditions: [] };
            return (
              <li key={companion.id} className="space-y-2 rounded-2xl border border-border p-3 text-sm">
                {editing ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <TextField label="Name" value={companion.name} max={120} onChange={(name) => update((b) => ({ ...b, companions: b.companions.map((c, i) => (i === index ? { ...c, name: name || c.name } : c)) }))} />
                    <label className="block text-xs text-muted">
                      Kind
                      <select
                        className={`${inputBaseClass} mt-1 h-10 w-full`}
                        value={companion.kind}
                        onChange={(event) => update((b) => ({ ...b, companions: b.companions.map((c, i) => (i === index ? { ...c, kind: event.target.value as typeof c.kind } : c)) }))}
                      >
                        {(["familiar", "companion", "summon", "mount", "other"] as const).map((kind) => (
                          <option key={kind} value={kind}>
                            {kind}
                          </option>
                        ))}
                      </select>
                    </label>
                    <NumberField label="AC" value={companion.ac} min={0} max={40} onChange={(ac) => update((b) => ({ ...b, companions: b.companions.map((c, i) => (i === index ? { ...c, ac } : c)) }))} />
                    <NumberField label="Max HP" value={companion.maxHp} min={1} max={2000} onChange={(maxHp) => update((b) => ({ ...b, companions: b.companions.map((c, i) => (i === index ? { ...c, maxHp } : c)) }))} />
                    <TextField label="Speed" value={companion.speed} max={60} onChange={(speed) => update((b) => ({ ...b, companions: b.companions.map((c, i) => (i === index ? { ...c, speed } : c)) }))} />
                    <div className="flex items-end justify-end">
                      <Button size="icon" variant="danger-ghost" icon={Trash2} aria-label={`Remove ${companion.name}`} onClick={() => update((b) => ({ ...b, companions: b.companions.filter((_, i) => i !== index) }))} />
                    </div>
                    <div className="sm:col-span-2">
                      <TextArea label="Notes" value={companion.notes} max={2000} onChange={(notes) => update((b) => ({ ...b, companions: b.companions.map((c, i) => (i === index ? { ...c, notes } : c)) }))} />
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="font-medium">
                      {companion.name} <span className="text-xs font-normal text-muted">{companion.kind}</span>
                    </p>
                    <p className="text-muted">
                      AC {companion.ac} · HP {state.hp}/{companion.maxHp}
                      {state.tempHp ? ` (+${state.tempHp})` : ""} · {companion.speed}
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="danger" onClick={() => void apply([{ op: "companion", id: companion.id, change: { op: "damage", amount: 1 } }])}>
                        −1 HP
                      </Button>
                      <Button size="sm" onClick={() => void apply([{ op: "companion", id: companion.id, change: { op: "heal", amount: 1 } }])}>
                        +1 HP
                      </Button>
                    </div>
                    {companion.notes ? <RichText text={companion.notes} className="text-xs" /> : null}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
