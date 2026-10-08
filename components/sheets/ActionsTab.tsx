"use client";

import { Plus, Swords, Trash2 } from "lucide-react";
import { Button, EmptyState, inputBaseClass } from "@/components/ui";
import type { Attack, Resource } from "@/lib/sheets/body";
import { ABILITIES, ABILITY_NAMES } from "@/lib/sheets/rules";
import { diceError } from "@/components/dm/spells/SpellForm";
import { newLocalId, NumberField, Pips, Section, signed, TextField } from "./bits";
import { RollButton, useRoller } from "./Roller";
import type { SheetHandle } from "./useSheet";

const ABILITY_CHOICES: { value: Attack["ability"]; label: string }[] = [
  { value: "best-str-dex", label: "Finesse (Str or Dex)" },
  ...ABILITIES.map((a) => ({ value: a as Attack["ability"], label: ABILITY_NAMES[a] })),
  { value: "spell", label: "Spell attack" },
  { value: "none", label: "No ability" },
];

function AttackEditor({ attack, onChange, onRemove }: { attack: Attack; onChange: (next: Attack) => void; onRemove: () => void }) {
  const damage = attack.damage[0] ?? { roll: "1d6", type: "", addAbility: true };
  const error = diceError(damage.roll);
  return (
    <div className="grid gap-2 rounded-2xl border border-border p-3 grid-cols-1 sm:grid-cols-6">
      <div className="sm:col-span-2">
        <TextField label="Name" value={attack.name} max={120} onChange={(name) => onChange({ ...attack, name: name || attack.name })} />
      </div>
      <label className="block text-xs text-muted sm:col-span-2">
        Uses
        <select className={`${inputBaseClass} mt-1 h-10 w-full`} value={attack.ability} onChange={(event) => onChange({ ...attack, ability: event.target.value as Attack["ability"] })}>
          {ABILITY_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>
      <NumberField label="Extra to hit" value={attack.toHitBonus} min={-20} max={30} onChange={(toHitBonus) => onChange({ ...attack, toHitBonus })} />
      <label className="flex items-end gap-2 pb-3 text-xs text-muted">
        <input type="checkbox" className="accent-[var(--accent)]" checked={attack.proficient} onChange={(event) => onChange({ ...attack, proficient: event.target.checked })} />
        Proficient
      </label>
      <label className="block text-xs text-muted sm:col-span-2">
        Damage {error ? <span className="text-danger">{error}</span> : null}
        <input
          className={`${inputBaseClass} mt-1 h-10 w-full`}
          aria-invalid={Boolean(error)}
          value={damage.roll}
          maxLength={40}
          onChange={(event) => onChange({ ...attack, damage: [{ ...damage, roll: event.target.value }, ...attack.damage.slice(1)] })}
        />
      </label>
      <TextField label="Damage type" value={damage.type} max={30} onChange={(type) => onChange({ ...attack, damage: [{ ...damage, type }, ...attack.damage.slice(1)] })} />
      <label className="flex items-end gap-2 pb-3 text-xs text-muted">
        <input type="checkbox" className="accent-[var(--accent)]" checked={damage.addAbility} onChange={(event) => onChange({ ...attack, damage: [{ ...damage, addAbility: event.target.checked }, ...attack.damage.slice(1)] })} />
        Add ability
      </label>
      <TextField label="Range" value={attack.range} max={60} onChange={(range) => onChange({ ...attack, range })} />
      <div className="flex items-end justify-end">
        <Button size="icon" variant="danger-ghost" icon={Trash2} aria-label={`Remove ${attack.name}`} onClick={onRemove} />
      </div>
    </div>
  );
}

function ResourceEditor({ resource, onChange, onRemove }: { resource: Resource; onChange: (next: Resource) => void; onRemove: () => void }) {
  const fixed = typeof resource.max === "number";
  return (
    <div className="grid gap-2 rounded-2xl border border-border p-3 grid-cols-1 sm:grid-cols-5">
      <div className="sm:col-span-2">
        <TextField label="Name" value={resource.name} max={120} onChange={(name) => onChange({ ...resource, name: name || resource.name })} />
      </div>
      <label className="block text-xs text-muted">
        Maximum
        <select
          className={`${inputBaseClass} mt-1 h-10 w-full`}
          value={fixed ? "number" : (resource.max as { formula: string }).formula}
          onChange={(event) => {
            const value = event.target.value;
            onChange({ ...resource, max: value === "number" ? 1 : { formula: value as "level", classId: null, plus: 0 } });
          }}
        >
          <option value="number">A number</option>
          <option value="level">Class level</option>
          <option value="prof">Proficiency bonus</option>
          {ABILITIES.map((a) => (
            <option key={a} value={`mod:${a}`}>
              {ABILITY_NAMES[a]} modifier
            </option>
          ))}
        </select>
      </label>
      {fixed ? (
        <NumberField label="Uses" value={resource.max as number} min={0} max={99} onChange={(max) => onChange({ ...resource, max })} />
      ) : (
        <NumberField label="Plus" value={(resource.max as { plus: number }).plus} min={-20} max={40} onChange={(plus) => onChange({ ...resource, max: { ...(resource.max as { formula: "level"; classId: null; plus: number }), plus } })} />
      )}
      <label className="block text-xs text-muted">
        Comes back on
        <select className={`${inputBaseClass} mt-1 h-10 w-full`} value={resource.reset} onChange={(event) => onChange({ ...resource, reset: event.target.value as Resource["reset"] })}>
          <option value="short">Short rest</option>
          <option value="long">Long rest</option>
          <option value="dawn">Dawn</option>
          <option value="none">Never by itself</option>
        </select>
      </label>
      <div className="flex items-end justify-end sm:col-span-5">
        <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={onRemove}>
          Remove
        </Button>
      </div>
    </div>
  );
}

export function ActionsTab({ sheet, editing }: { sheet: SheetHandle; editing: boolean }) {
  const { body, derived, update, apply } = sheet;
  const { roll } = useRoller();

  return (
    <div className="space-y-4">
      <Section
        title="Attacks"
        action={
          editing && body.combat.attacks.length < 40 ? (
            <Button
              size="sm"
              icon={Plus}
              onClick={() =>
                update((b) => ({
                  ...b,
                  combat: {
                    ...b.combat,
                    attacks: [...b.combat.attacks, { id: newLocalId(), name: "New attack", ability: "best-str-dex", proficient: true, toHitBonus: 0, damage: [{ roll: "1d6", type: "", addAbility: true }], range: "", properties: "", notes: "", itemId: null }],
                  },
                }))
              }
            >
              Attack
            </Button>
          ) : null
        }
      >
        {body.combat.attacks.length === 0 ? (
          <EmptyState icon={Swords} title="No attacks yet">
            {editing ? "Add one with the button above." : "Turn on editing to add your weapons and unarmed strikes."}
          </EmptyState>
        ) : editing ? (
          <div className="space-y-2">
            {body.combat.attacks.map((attack, index) => (
              <AttackEditor
                key={attack.id}
                attack={attack}
                onChange={(next) => update((b) => ({ ...b, combat: { ...b.combat, attacks: b.combat.attacks.map((a, i) => (i === index ? next : a)) } }))}
                onRemove={() => update((b) => ({ ...b, combat: { ...b.combat, attacks: b.combat.attacks.filter((_, i) => i !== index) } }))}
              />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {body.combat.attacks.map((attack) => {
              const info = derived.attacks.find((a) => a.id === attack.id);
              return (
                <li key={attack.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 font-medium">
                    {attack.name}
                    {attack.range ? <span className="ml-2 text-xs font-normal text-muted">{attack.range}</span> : null}
                  </span>
                  {info?.toHit !== null && info ? <RollButton bonus={info.toHit} label={`${attack.name} attack`} /> : null}
                  {info?.damage.map((text, i) => (
                    <button
                      key={i}
                      type="button"
                      className="rounded-lg border border-border px-2 py-1 font-mono text-xs hover:border-accent hover:text-accent"
                      onClick={() => void roll(text.split(" ")[0], `${attack.name} damage`)}
                    >
                      {text}
                    </button>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section
        title="Resources"
        action={
          editing && body.resources.length < 30 ? (
            <Button size="sm" icon={Plus} onClick={() => update((b) => ({ ...b, resources: [...b.resources, { id: newLocalId(), name: "New resource", max: 1, reset: "long", resetAmount: "all" }] }))}>
              Resource
            </Button>
          ) : null
        }
      >
        {editing ? (
          <div className="space-y-2">
            {body.resources.map((resource, index) => (
              <ResourceEditor
                key={resource.id}
                resource={resource}
                onChange={(next) => update((b) => ({ ...b, resources: b.resources.map((r, i) => (i === index ? next : r)) }))}
                onRemove={() => update((b) => ({ ...b, resources: b.resources.filter((_, i) => i !== index) }))}
              />
            ))}
          </div>
        ) : derived.resources.length === 0 ? (
          <p className="text-sm text-muted">Ki, Rage, Bardic Inspiration and the like go here.</p>
        ) : (
          <ul className="space-y-2">
            {derived.resources.map((resource) => (
              <li key={resource.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="font-medium">
                  {resource.name}
                  <span className="ml-2 text-xs text-muted">
                    {resource.left}/{resource.max}
                  </span>
                </span>
                <Pips
                  total={Math.min(resource.max, 20)}
                  left={Math.min(resource.left, 20)}
                  label={resource.name}
                  onSpend={() => void apply([{ op: "useResource", id: resource.id, amount: 1 }])}
                  onRestore={() => void apply([{ op: "restoreResource", id: resource.id, amount: 1 }])}
                />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p className="text-xs text-faint">Proficiency bonus {signed(derived.proficiency)}. Hover or long-press a number to see how it is worked out.</p>
    </div>
  );
}
