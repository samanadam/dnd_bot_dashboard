"use client";

import { ChevronDown, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { CampaignSelect } from "@/components/CampaignSelect";
import { Button, Notice, inputBaseClass, inputClass } from "@/components/ui";
import { useCampaignSelection } from "@/lib/campaign/useSelection";
import { dm, DmError } from "@/lib/dm/client";
import type { CreatureInput, CreatureKind } from "@/lib/dm/creatures";
import {
  ABILITIES,
  ABILITY_NAMES,
  CR_VALUES,
  SIZES,
  XP_BY_CR,
  abilityModifier,
  formatModifier,
  statBlockSchema,
  type Ability,
  type Feature,
  type StatBlock,
} from "@/lib/dm/statblock";

export const EMPTY_BLOCK: StatBlock = {
  name: "",
  size: "Medium",
  type: "Humanoid",
  alignment: "",
  ac: 12,
  acNote: "",
  hp: 11,
  hitDice: "2d8+2",
  speed: "30 ft.",
  abilities: { str: 10, dex: 12, con: 12, int: 10, wis: 10, cha: 10 },
  saves: {},
  skills: {},
  senses: "passive Perception 10",
  languages: "Common",
  cr: "1/4",
  xp: 50,
  damageVulnerabilities: "",
  damageResistances: "",
  damageImmunities: "",
  conditionImmunities: "",
  traits: [],
  actions: [],
  bonusActions: [],
  reactions: [],
  legendaryActions: [],
  legendaryDescription: "",
};

const LISTS = [
  ["traits", "Traits", "A passive ability, e.g. Pack Tactics."],
  ["actions", "Actions", "Attacks and other actions. Add a to-hit bonus to make it rollable."],
  ["bonusActions", "Bonus actions", ""],
  ["reactions", "Reactions", ""],
  ["legendaryActions", "Legendary actions", ""],
] as const;

type ListKey = (typeof LISTS)[number][0];

const DEFENSES = [
  ["damageResistances", "Damage resistances"],
  ["damageImmunities", "Damage immunities"],
  ["damageVulnerabilities", "Damage vulnerabilities"],
  ["conditionImmunities", "Condition immunities"],
] as const;

function toInt(value: string, fallback: number): number {
  if (value.trim() === "" || value.trim() === "-") return fallback;
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <div className="mb-4">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Labeled({ id, label, hint, children, className = "" }: { id: string; label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint ? <p className="mt-1 text-xs text-faint">{hint}</p> : null}
    </div>
  );
}

function FeatureEditor({
  listKey,
  index,
  feature,
  onChange,
  onRemove,
}: {
  listKey: ListKey;
  index: number;
  feature: Feature;
  onChange: (feature: Feature) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(feature.name === "");
  const id = `cf-${listKey}-${index}`;
  const attack = feature.attack;
  return (
    <div className="rounded-2xl border border-border bg-surface-2">
      <div className="flex items-center gap-2 p-2 pl-3">
        <button type="button" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronDown className={`size-4 shrink-0 text-muted transition ${open ? "" : "-rotate-90"}`} aria-hidden />
          <span className={`truncate font-display text-base font-semibold italic ${feature.name ? "" : "text-faint"}`}>{feature.name || "Untitled"}</span>
          {attack ? <span className="shrink-0 rounded-md bg-accent-soft px-1.5 text-[11px] font-medium text-accent">{formatModifier(attack.toHit)} to hit</span> : null}
        </button>
        <Button size="icon" variant="danger-ghost" className="size-8" icon={Trash2} aria-label={`Remove ${feature.name || "entry"}`} onClick={onRemove} />
      </div>
      {open ? (
        <div id={`${id}-body`} className="grid gap-3 border-t border-border p-3 sm:grid-cols-6">
          <Labeled id={`${id}-name`} label="Name" className="sm:col-span-6">
            <input id={`${id}-name`} className={inputClass} value={feature.name} maxLength={120} onChange={(e) => onChange({ ...feature, name: e.target.value })} />
          </Labeled>
          <Labeled id={`${id}-desc`} label="Description" className="sm:col-span-6">
            <textarea id={`${id}-desc`} className={`${inputBaseClass} min-h-24 w-full py-2.5 leading-relaxed`} value={feature.desc} maxLength={4000} onChange={(e) => onChange({ ...feature, desc: e.target.value })} />
          </Labeled>
          <Labeled id={`${id}-hit`} label="To hit" hint="Leave empty if not an attack" className="sm:col-span-2">
            <input
              id={`${id}-hit`}
              inputMode="numeric"
              className={inputClass}
              placeholder="+4"
              value={attack ? String(attack.toHit) : ""}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9-]/g, "");
                if (raw === "") {
                  onChange({ name: feature.name, desc: feature.desc });
                } else {
                  onChange({ ...feature, attack: { ...attack, toHit: Math.max(-20, Math.min(40, toInt(raw, 0))) } });
                }
              }}
            />
          </Labeled>
          <Labeled id={`${id}-dmg`} label="Damage" className="sm:col-span-2">
            <input
              id={`${id}-dmg`}
              className={`${inputClass} font-mono`}
              placeholder="1d6+2"
              maxLength={40}
              disabled={!attack}
              value={attack?.damage ?? ""}
              onChange={(e) => attack && onChange({ ...feature, attack: { ...attack, damage: e.target.value || undefined } })}
            />
          </Labeled>
          <Labeled id={`${id}-type`} label="Damage type" className="sm:col-span-2">
            <input
              id={`${id}-type`}
              className={inputClass}
              placeholder="Slashing"
              maxLength={40}
              disabled={!attack}
              value={attack?.damageType ?? ""}
              onChange={(e) => attack && onChange({ ...feature, attack: { ...attack, damageType: e.target.value || undefined } })}
            />
          </Labeled>
        </div>
      ) : null}
    </div>
  );
}

function KeyValueEditor({
  id,
  entries,
  keys,
  keyLabel,
  onChange,
}: {
  id: string;
  entries: [string, number][];
  keys: readonly string[];
  keyLabel: (key: string) => string;
  onChange: (entries: [string, number][]) => void;
}) {
  const unused = keys.filter((key) => !entries.some(([existing]) => existing === key));
  return (
    <div className="space-y-2">
      {entries.map(([key, value], index) => (
        <div key={key} className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm capitalize">{keyLabel(key)}</span>
          <label htmlFor={`${id}-${key}`} className="sr-only">
            {keyLabel(key)} bonus
          </label>
          <input
            id={`${id}-${key}`}
            inputMode="numeric"
            className={`${inputBaseClass} h-9 w-20 px-2 text-center tabular-nums`}
            value={String(value)}
            onChange={(e) => onChange(entries.map((entry, i) => (i === index ? [key, Math.max(-20, Math.min(40, toInt(e.target.value.replace(/[^0-9-]/g, ""), 0)))] : entry)))}
          />
          <Button size="icon" variant="ghost" className="size-9" icon={Trash2} aria-label={`Remove ${keyLabel(key)}`} onClick={() => onChange(entries.filter((_, i) => i !== index))} />
        </div>
      ))}
      {unused.length ? (
        <>
          <label htmlFor={`${id}-add`} className="sr-only">
            Add
          </label>
          <select
            id={`${id}-add`}
            className={`${inputBaseClass} h-9 w-full`}
            value=""
            onChange={(e) => e.target.value && onChange([...entries, [e.target.value, 0]])}
          >
            <option value="">Add…</option>
            {unused.map((key) => (
              <option key={key} value={key}>
                {keyLabel(key)}
              </option>
            ))}
          </select>
        </>
      ) : null}
    </div>
  );
}

const SKILLS = [
  "acrobatics", "animal_handling", "arcana", "athletics", "deception", "history", "insight", "intimidation", "investigation",
  "medicine", "nature", "perception", "performance", "persuasion", "religion", "sleight_of_hand", "stealth", "survival",
] as const;

export function CreatureForm({ id, initial, kind: initialKind = "monster" }: { id?: string; initial?: CreatureInput; kind?: CreatureKind }) {
  const router = useRouter();
  const [kind, setKind] = useState<CreatureKind>(initial?.kind ?? initialKind);
  const [block, setBlock] = useState<StatBlock>(initial?.statBlock ?? EMPTY_BLOCK);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A new NPC starts in the campaign being looked at; an existing one keeps its own.
  const [picked] = useCampaignSelection();
  const [campaignId, setCampaignId] = useState<string | null>(
    initial?.campaignId !== undefined ? initial.campaignId : picked && picked !== "unassigned" ? picked : null,
  );

  const set = <K extends keyof StatBlock>(key: K, value: StatBlock[K]) => setBlock((current) => ({ ...current, [key]: value }));
  const setList = (key: ListKey, items: Feature[]) => set(key, items);

  async function save() {
    setError(null);
    const input: CreatureInput = {
      kind,
      statBlock: block,
      notes,
      tags: [...new Set(tags.split(",").map((tag) => tag.trim()).filter(Boolean))].slice(0, 20),
      ...(kind === "npc" ? { campaignId } : {}),
    };
    const check = statBlockSchema.safeParse(block);
    if (!check.success) {
      const issue = check.error.issues[0];
      setError(`${issue.path.join(" › ") || "Stat block"}: ${issue.message}`);
      return;
    }
    setBusy(true);
    try {
      const saved = id ? await dm.updateCreature(id, input) : await dm.createCreature(input);
      router.push(`/dm/bestiary/custom/${saved.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof DmError ? err.message : "Could not save. Try again.");
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {error ? <Notice title="Not saved yet">{error}</Notice> : null}

      {kind === "npc" ? (
        <Panel title="Campaign">
          <CampaignSelect label="Campaign" noneLabel="Not in a campaign" value={campaignId} onChange={setCampaignId} />
        </Panel>
      ) : null}

      <Panel title="Identity">
        <div className="grid gap-4 sm:grid-cols-6">
          <Labeled id="cf-name" label="Name" className="sm:col-span-4">
            <input id="cf-name" className={`${inputClass} font-display text-lg`} value={block.name} maxLength={120} required placeholder="Captain Vex" onChange={(e) => set("name", e.target.value)} />
          </Labeled>
          <div className="sm:col-span-2">
            <span className="text-xs font-medium text-muted">Kind</span>
            <div role="radiogroup" aria-label="Kind" className="mt-1.5 grid h-11 grid-cols-2 gap-1 rounded-xl border border-border bg-bg/40 p-1">
              {(["monster", "npc"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={kind === value}
                  onClick={() => setKind(value)}
                  className={`rounded-lg text-sm font-medium transition ${kind === value ? "bg-surface-3 text-text shadow-card" : "text-muted hover:text-text"}`}
                >
                  {value === "npc" ? "NPC" : "Monster"}
                </button>
              ))}
            </div>
          </div>
          <Labeled id="cf-size" label="Size" className="sm:col-span-2">
            <select id="cf-size" className={inputClass} value={block.size} onChange={(e) => set("size", e.target.value as StatBlock["size"])}>
              {SIZES.map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </Labeled>
          <Labeled id="cf-type" label="Type" className="sm:col-span-2">
            <input id="cf-type" className={inputClass} value={block.type} maxLength={80} placeholder="Humanoid (Elf)" onChange={(e) => set("type", e.target.value)} />
          </Labeled>
          <Labeled id="cf-align" label="Alignment" className="sm:col-span-2">
            <input id="cf-align" className={inputClass} value={block.alignment} maxLength={80} placeholder="Neutral Evil" onChange={(e) => set("alignment", e.target.value)} />
          </Labeled>
          <Labeled id="cf-cr" label="Challenge rating" className="sm:col-span-3">
            <select
              id="cf-cr"
              className={inputClass}
              value={block.cr}
              onChange={(e) => setBlock((current) => ({ ...current, cr: e.target.value, xp: XP_BY_CR[e.target.value] ?? current.xp }))}
            >
              {CR_VALUES.map((cr) => (
                <option key={cr} value={cr}>
                  CR {cr} · {(XP_BY_CR[cr] ?? 0).toLocaleString("en")} XP
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled id="cf-xp" label="XP" hint="Filled in from the CR" className="sm:col-span-3">
            <input id="cf-xp" inputMode="numeric" className={inputClass} value={String(block.xp)} onChange={(e) => set("xp", Math.max(0, toInt(e.target.value.replace(/\D/g, ""), 0)))} />
          </Labeled>
        </div>
      </Panel>

      <Panel title="Defense and movement">
        <div className="grid gap-4 sm:grid-cols-6">
          <Labeled id="cf-ac" label="Armor class" className="sm:col-span-1">
            <input id="cf-ac" inputMode="numeric" className={`${inputClass} text-center text-lg tabular-nums`} value={String(block.ac)} onChange={(e) => set("ac", Math.max(0, Math.min(40, toInt(e.target.value.replace(/\D/g, ""), 0))))} />
          </Labeled>
          <Labeled id="cf-acnote" label="Armor" className="sm:col-span-2">
            <input id="cf-acnote" className={inputClass} value={block.acNote} maxLength={120} placeholder="chain shirt" onChange={(e) => set("acNote", e.target.value)} />
          </Labeled>
          <Labeled id="cf-hp" label="Hit points" className="sm:col-span-1">
            <input id="cf-hp" inputMode="numeric" className={`${inputClass} text-center text-lg tabular-nums`} value={String(block.hp)} onChange={(e) => set("hp", Math.max(1, Math.min(10_000, toInt(e.target.value.replace(/\D/g, ""), 1))))} />
          </Labeled>
          <Labeled id="cf-hd" label="Hit dice" className="sm:col-span-2">
            <input id="cf-hd" className={`${inputClass} font-mono`} value={block.hitDice} maxLength={40} placeholder="4d8+4" onChange={(e) => set("hitDice", e.target.value)} />
          </Labeled>
          <Labeled id="cf-speed" label="Speed" className="sm:col-span-4">
            <input id="cf-speed" className={inputClass} value={block.speed} maxLength={200} placeholder="30 ft., climb 20 ft." onChange={(e) => set("speed", e.target.value)} />
          </Labeled>
          <Labeled id="cf-init" label="Initiative bonus" hint="Empty = Dex modifier" className="sm:col-span-2">
            <input
              id="cf-init"
              inputMode="numeric"
              className={inputClass}
              placeholder={formatModifier(abilityModifier(block.abilities.dex))}
              value={block.initiativeBonus === undefined ? "" : String(block.initiativeBonus)}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9-]/g, "");
                setBlock((current) => {
                  const next = { ...current };
                  if (raw === "" || raw === "-") delete next.initiativeBonus;
                  else next.initiativeBonus = Math.max(-20, Math.min(40, toInt(raw, 0)));
                  return next;
                });
              }}
            />
          </Labeled>
          {DEFENSES.map(([key, label]) => (
            <Labeled key={key} id={`cf-${key}`} label={label} className="sm:col-span-3">
              <input id={`cf-${key}`} className={inputClass} value={block[key]} maxLength={300} onChange={(e) => set(key, e.target.value)} />
            </Labeled>
          ))}
        </div>
      </Panel>

      <Panel title="Abilities">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {ABILITIES.map((ability: Ability) => (
            <div key={ability} className="rounded-2xl border border-border bg-surface-2 p-3 text-center">
              <label htmlFor={`cf-${ability}`} className="block text-[11px] font-semibold uppercase tracking-widest text-faint" title={ABILITY_NAMES[ability]}>
                {ability}
              </label>
              <input
                id={`cf-${ability}`}
                inputMode="numeric"
                className="mt-1 w-full bg-transparent text-center text-2xl font-semibold tabular-nums focus:outline-none"
                value={String(block.abilities[ability])}
                onChange={(e) => set("abilities", { ...block.abilities, [ability]: Math.max(1, Math.min(30, toInt(e.target.value.replace(/\D/g, ""), 1))) })}
              />
              <span className="text-xs tabular-nums text-muted">{formatModifier(abilityModifier(block.abilities[ability]))}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-medium text-muted">Saving throws</h3>
            <KeyValueEditor
              id="cf-saves"
              entries={Object.entries(block.saves) as [string, number][]}
              keys={ABILITIES}
              keyLabel={(key) => ABILITY_NAMES[key as Ability]}
              onChange={(entries) => set("saves", Object.fromEntries(entries) as StatBlock["saves"])}
            />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium text-muted">Skills</h3>
            <KeyValueEditor
              id="cf-skills"
              entries={Object.entries(block.skills)}
              keys={SKILLS}
              keyLabel={(key) => key.replace(/_/g, " ")}
              onChange={(entries) => set("skills", Object.fromEntries(entries))}
            />
          </div>
          <Labeled id="cf-senses" label="Senses">
            <input id="cf-senses" className={inputClass} value={block.senses} maxLength={300} onChange={(e) => set("senses", e.target.value)} />
          </Labeled>
          <Labeled id="cf-languages" label="Languages">
            <input id="cf-languages" className={inputClass} value={block.languages} maxLength={300} onChange={(e) => set("languages", e.target.value)} />
          </Labeled>
        </div>
      </Panel>

      {LISTS.map(([key, label, hint]) => (
        <Panel key={key} title={label} description={hint || undefined}>
          <div className="space-y-2">
            {key === "legendaryActions" && block.legendaryActions.length ? (
              <Labeled id="cf-legendary-desc" label="Introduction">
                <textarea
                  id="cf-legendary-desc"
                  className={`${inputBaseClass} min-h-16 w-full py-2.5`}
                  value={block.legendaryDescription}
                  maxLength={1000}
                  onChange={(e) => set("legendaryDescription", e.target.value)}
                />
              </Labeled>
            ) : null}
            {block[key].map((feature, index) => (
              <FeatureEditor
                key={`${key}-${index}`}
                listKey={key}
                index={index}
                feature={feature}
                onChange={(next) => setList(key, block[key].map((item, i) => (i === index ? next : item)))}
                onRemove={() => setList(key, block[key].filter((_, i) => i !== index))}
              />
            ))}
            <Button size="sm" icon={Plus} onClick={() => setList(key, [...block[key], { name: "", desc: "" }])}>
              Add {label.toLowerCase().replace(/s$/, "")}
            </Button>
          </div>
        </Panel>
      ))}

      <Panel title="Private notes" description="Only you see these. Personality, secrets, where the party met them.">
        <div className="grid gap-4">
          <Labeled id="cf-notes" label="Notes">
            <textarea id="cf-notes" className={`${inputBaseClass} min-h-32 w-full py-2.5 leading-relaxed`} value={notes} maxLength={20_000} onChange={(e) => setNotes(e.target.value)} />
          </Labeled>
          <Labeled id="cf-tags" label="Tags" hint="Comma separated, e.g. chapter 2, cult, Phandalin">
            <input id="cf-tags" className={inputClass} value={tags} maxLength={900} onChange={(e) => setTags(e.target.value)} />
          </Labeled>
        </div>
      </Panel>

      {/* Sticky save bar. On phones it sits above the tab bar and leaves room for the dice button. */}
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)] z-30 lg:bottom-4">
        <div className="flex items-center justify-end gap-2 rounded-2xl border border-border bg-surface/95 py-2.5 pl-3 pr-20 shadow-2xl backdrop-blur-xl lg:pr-24">
          <span className="mr-auto hidden truncate text-sm text-muted sm:block">{block.name || "Unnamed creature"}</span>
          <Button onClick={() => router.back()} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" icon={Save} busy={busy}>
            {id ? "Save changes" : kind === "npc" ? "Create NPC" : "Create monster"}
          </Button>
        </div>
      </div>
    </form>
  );
}
