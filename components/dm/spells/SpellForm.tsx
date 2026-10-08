"use client";

import { Plus, Save, Trash2, X } from "lucide-react";
import { useState } from "react";
import { CampaignSelect } from "@/components/CampaignSelect";
import { useToast } from "@/components/Providers";
import { Button, Field, Notice, inputBaseClass, inputClass } from "@/components/ui";
import { dm, DmError } from "@/lib/dm/client";
import { ABILITIES, customSpellSchema, diceSchema, SCHOOLS, spellBlockSchema, type CustomSpell, type CustomSpellInput, type SpellBlock } from "@/lib/dm/spells";

const EMPTY: CustomSpellInput = {
  name: "",
  level: 1,
  school: "evocation",
  castingTime: "1 action",
  ritual: false,
  range: "60 feet",
  components: { verbal: true, somatic: true, material: false, materialText: "", materialCostGp: null, materialConsumed: false },
  duration: "Instantaneous",
  concentration: false,
  classes: [],
  attack: null,
  save: null,
  effect: null,
  scaling: null,
  description: "",
  higherLevel: "",
};

const LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const CASTING_TIMES = ["1 action", "1 bonus action", "1 reaction", "1 minute", "10 minutes", "1 hour", "8 hours"];
const CLASSES = ["Bard", "Cleric", "Druid", "Paladin", "Ranger", "Sorcerer", "Warlock", "Wizard"];

const capital = (text: string) => text[0].toUpperCase() + text.slice(1);

/** Just the spell's own fields, without the id and bookkeeping a stored row carries. */
function blockOf(spell: CustomSpell): SpellBlock {
  return Object.fromEntries(Object.keys(spellBlockSchema.shape).map((key) => [key, spell[key as keyof SpellBlock]])) as SpellBlock;
}

/** Inline check for one dice field, using the same rule the server applies. */
export function diceError(value: string): string | null {
  if (!value.trim()) return null;
  return diceSchema.safeParse(value).success ? null : "Use dice like 2d6+3.";
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

/** Create or edit a custom spell. `seed` pre-fills it from an SRD spell ("Duplicate as custom"). */
export function SpellForm({
  spell,
  seed,
  defaultCampaign,
  onSaved,
  onCancel,
  submit,
  fixedCampaign = false,
}: {
  spell?: CustomSpell;
  seed?: SpellBlock;
  defaultCampaign: string | null;
  onSaved: (saved: CustomSpell) => void;
  onCancel: () => void;
  // Where a new spell goes; the DM's own library unless a player's homebrew route is given.
  submit?: (input: CustomSpellInput) => Promise<CustomSpell>;
  // Homebrew stays in the campaign it is made in: no picker.
  fixedCampaign?: boolean;
}) {
  const toast = useToast();
  const start: CustomSpellInput = spell
    ? blockOf(spell)
    : seed
      ? { ...seed, name: `${seed.name} (house)` }
      : EMPTY;
  const [value, setValue] = useState<CustomSpellInput>(start);
  const [campaignId, setCampaignId] = useState<string | null>(spell ? spell.campaignId : defaultCampaign);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof CustomSpellInput>(key: K, next: CustomSpellInput[K]) => setValue((current) => ({ ...current, [key]: next }));
  const setComponent = <K extends keyof CustomSpellInput["components"]>(key: K, next: CustomSpellInput["components"][K]) =>
    setValue((current) => ({ ...current, components: { ...current.components, [key]: next } }));

  const effectRollError = value.effect ? diceError(value.effect.roll) : null;
  const stepErrors = value.scaling?.steps.map((step) => diceError(step.roll)) ?? [];
  const invalidDice = Boolean(effectRollError) || stepErrors.some(Boolean);

  async function save() {
    const parsed = customSpellSchema.safeParse({ ...value, campaignId });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(`${issue?.path.join(".") || "spell"}: ${issue?.message ?? "invalid"}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = spell ? await dm.updateSpell(spell.id, parsed.data) : submit ? await submit(parsed.data) : await dm.createSpell(parsed.data);
      toast("ok", spell ? "Spell saved." : "Spell added.");
      onSaved(saved);
    } catch (caught) {
      setError(caught instanceof DmError ? caught.message : "Could not save the spell.");
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
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        <Field label="Name">
          <input className={inputClass} value={value.name} maxLength={120} onChange={(event) => set("name", event.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Level">
            <select className={`${inputBaseClass} h-11 w-full`} value={value.level} onChange={(event) => set("level", Number(event.target.value))}>
              {LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level === 0 ? "Cantrip" : `Level ${level}`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="School">
            <select className={`${inputBaseClass} h-11 w-full`} value={value.school} onChange={(event) => set("school", event.target.value as CustomSpellInput["school"])}>
              {SCHOOLS.map((school) => (
                <option key={school} value={school}>
                  {capital(school)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Casting time">
          <input className={inputClass} list="spell-casting-times" value={value.castingTime} maxLength={200} onChange={(event) => set("castingTime", event.target.value)} />
          <datalist id="spell-casting-times">
            {CASTING_TIMES.map((time) => (
              <option key={time} value={time} />
            ))}
          </datalist>
        </Field>
        <Field label="Range">
          <input className={inputClass} value={value.range} maxLength={60} placeholder="60 feet, Self (15-foot cone), Touch" onChange={(event) => set("range", event.target.value)} />
        </Field>
        <Field label="Duration">
          <input className={inputClass} value={value.duration} maxLength={60} onChange={(event) => set("duration", event.target.value)} />
        </Field>
        <Field label="Classes" hint="Comma separated.">
          <input
            className={inputClass}
            list="spell-classes"
            value={value.classes.join(", ")}
            maxLength={400}
            onChange={(event) =>
              set(
                "classes",
                event.target.value
                  .split(",")
                  .map((part) => part.trim())
                  .filter(Boolean)
                  .slice(0, 16),
              )
            }
          />
          <datalist id="spell-classes">
            {CLASSES.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </Field>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Check label="Ritual" checked={value.ritual} onChange={(next) => set("ritual", next)} />
        <Check label="Concentration" checked={value.concentration} onChange={(next) => set("concentration", next)} />
        <Check label="Verbal" checked={value.components.verbal} onChange={(next) => setComponent("verbal", next)} />
        <Check label="Somatic" checked={value.components.somatic} onChange={(next) => setComponent("somatic", next)} />
        <Check label="Material" checked={value.components.material} onChange={(next) => setComponent("material", next)} />
      </div>
      {value.components.material ? (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-[1fr_10rem_auto]">
          <Field label="Material">
            <input className={inputClass} value={value.components.materialText} maxLength={500} onChange={(event) => setComponent("materialText", event.target.value)} />
          </Field>
          <Field label="Worth (gp)">
            <input
              className={inputClass}
              type="number"
              min={0}
              value={value.components.materialCostGp ?? ""}
              onChange={(event) => setComponent("materialCostGp", event.target.value === "" ? null : Math.max(0, Number(event.target.value) || 0))}
            />
          </Field>
          <div className="flex items-end pb-3">
            <Check label="Consumed" checked={value.components.materialConsumed} onChange={(next) => setComponent("materialConsumed", next)} />
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <Field label="Attack">
          <select className={`${inputBaseClass} h-11 w-full`} value={value.attack ?? ""} onChange={(event) => set("attack", (event.target.value || null) as CustomSpellInput["attack"])}>
            <option value="">None</option>
            <option value="melee">Melee spell attack</option>
            <option value="ranged">Ranged spell attack</option>
          </select>
        </Field>
        <Field label="Saving throw">
          <select className={`${inputBaseClass} h-11 w-full`} value={value.save ?? ""} onChange={(event) => set("save", (event.target.value || null) as CustomSpellInput["save"])}>
            <option value="">None</option>
            {ABILITIES.map((ability) => (
              <option key={ability} value={ability}>
                {ability.toUpperCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Effect">
          <select
            className={`${inputBaseClass} h-11 w-full`}
            value={value.effect?.kind ?? ""}
            onChange={(event) => {
              const kind = event.target.value as "" | "damage" | "healing";
              set("effect", kind ? { kind, roll: value.effect?.roll ?? "1d6", types: kind === "damage" ? (value.effect?.types ?? []) : [] } : null);
            }}
          >
            <option value="">No roll</option>
            <option value="damage">Damage</option>
            <option value="healing">Healing</option>
          </select>
        </Field>
      </div>
      {value.effect ? (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          <Field label="Roll" hint={effectRollError ?? undefined}>
            <input
              className={inputClass}
              aria-invalid={Boolean(effectRollError)}
              value={value.effect.roll}
              maxLength={40}
              onChange={(event) => set("effect", { ...value.effect!, roll: event.target.value })}
            />
          </Field>
          {value.effect.kind === "damage" ? (
            <Field label="Damage types" hint="Comma separated.">
              <input
                className={inputClass}
                value={value.effect.types.join(", ")}
                maxLength={200}
                onChange={(event) =>
                  set("effect", {
                    ...value.effect!,
                    types: event.target.value
                      .split(",")
                      .map((part) => part.trim().toLowerCase())
                      .filter(Boolean)
                      .slice(0, 6),
                  })
                }
              />
            </Field>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Scaling</span>
          <select
            aria-label="Scaling"
            className={`${inputBaseClass} h-9`}
            value={value.scaling?.by ?? ""}
            onChange={(event) => {
              const by = event.target.value as "" | "slot" | "character";
              set("scaling", by ? { by, steps: value.scaling?.steps.length ? value.scaling.steps : [{ at: by === "slot" ? Math.min(9, value.level + 1) : 5, roll: "2d6" }] } : null);
            }}
          >
            <option value="">None</option>
            <option value="slot">By slot level</option>
            <option value="character">By character level</option>
          </select>
          {value.scaling && value.scaling.steps.length < 20 ? (
            <Button
              size="sm"
              icon={Plus}
              onClick={() => {
                const last = value.scaling!.steps.at(-1);
                set("scaling", { ...value.scaling!, steps: [...value.scaling!.steps, { at: Math.min(20, (last?.at ?? 1) + 1), roll: last?.roll ?? "1d6" }] });
              }}
            >
              Step
            </Button>
          ) : null}
        </div>
        {value.scaling?.steps.map((step, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              aria-label={`Step ${index + 1} level`}
              className={`${inputBaseClass} h-9 w-20`}
              type="number"
              min={1}
              max={20}
              value={step.at}
              onChange={(event) => {
                const steps = [...value.scaling!.steps];
                steps[index] = { ...step, at: Math.max(1, Math.min(20, Math.trunc(Number(event.target.value) || 1))) };
                set("scaling", { ...value.scaling!, steps });
              }}
            />
            <input
              aria-label={`Step ${index + 1} roll`}
              aria-invalid={Boolean(stepErrors[index])}
              className={`${inputBaseClass} h-9 w-32`}
              value={step.roll}
              maxLength={40}
              onChange={(event) => {
                const steps = [...value.scaling!.steps];
                steps[index] = { ...step, roll: event.target.value };
                set("scaling", { ...value.scaling!, steps });
              }}
            />
            {stepErrors[index] ? <span className="text-xs text-danger">{stepErrors[index]}</span> : null}
            <Button
              size="icon"
              variant="danger-ghost"
              icon={Trash2}
              aria-label={`Remove step ${index + 1}`}
              onClick={() => {
                const steps = value.scaling!.steps.filter((_, i) => i !== index);
                set("scaling", steps.length ? { ...value.scaling!, steps } : null);
              }}
            />
          </div>
        ))}
      </div>

      <Field label="Description" hint="**bold**, _italic_ and lines starting with - work.">
        <textarea className={`${inputBaseClass} min-h-28 w-full py-2.5`} value={value.description} maxLength={20_000} onChange={(event) => set("description", event.target.value)} />
      </Field>
      <Field label="At higher levels">
        <textarea className={`${inputBaseClass} min-h-16 w-full py-2.5`} value={value.higherLevel} maxLength={4_000} onChange={(event) => set("higherLevel", event.target.value)} />
      </Field>
      {fixedCampaign ? null : (
        <Field label="Campaign">
          <CampaignSelect dmScoped value={campaignId} onChange={setCampaignId} label="Campaign" noneLabel="Not in a campaign" />
        </Field>
      )}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex justify-end gap-2">
        <Button icon={X} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" icon={Save} busy={busy} disabled={!value.name.trim() || invalidDice}>
          {spell ? "Save spell" : "Add spell"}
        </Button>
      </div>
    </form>
  );
}
