"use client";

import { Plus, Trash2 } from "lucide-react";
import { Badge, Button, inputBaseClass } from "@/components/ui";
import type { ClassEntry } from "@/lib/sheets/body";
import { ABILITIES, ABILITY_NAMES, SKILL_IDS, SKILLS, SRD_CLASSES, srdClass } from "@/lib/sheets/rules";
import { ListField, newLocalId, NumberField, Section, signed, TextField } from "./bits";
import { RollButton } from "./Roller";
import type { SheetHandle } from "./useSheet";

const LEVELS = ["none", "half", "proficient", "expertise"] as const;
const LEVEL_MARK = { none: "", half: "½", proficient: "●", expertise: "◆" } as const;

function ClassRow({ entry, onChange, onRemove, canRemove }: { entry: ClassEntry; onChange: (next: ClassEntry) => void; onRemove: () => void; canRemove: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border p-3 sm:grid-cols-6">
      <label className="col-span-2 block text-xs text-muted">
        Class
        <input
          list="srd-classes"
          className={`${inputBaseClass} mt-1 h-10 w-full`}
          value={entry.name}
          maxLength={120}
          onChange={(event) => {
            const name = event.target.value;
            const known = srdClass(name);
            // Picking an SRD class fills in its rules; everything stays editable.
            onChange(known ? { ...entry, name: known.name, hitDie: known.hitDie, caster: known.caster, spellAbility: known.spellAbility, saveProficiencies: [...known.saves] } : { ...entry, name });
          }}
        />
      </label>
      <TextField label="Subclass" value={entry.subclass} max={120} onChange={(subclass) => onChange({ ...entry, subclass })} />
      <NumberField label="Level" value={entry.level} min={1} max={20} onChange={(level) => onChange({ ...entry, level })} />
      <label className="block text-xs text-muted">
        Hit die
        <select className={`${inputBaseClass} mt-1 h-10 w-full`} value={entry.hitDie} onChange={(event) => onChange({ ...entry, hitDie: Number(event.target.value) as ClassEntry["hitDie"] })}>
          {[6, 8, 10, 12].map((d) => (
            <option key={d} value={d}>
              d{d}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-muted">
        Casting
        <select className={`${inputBaseClass} mt-1 h-10 w-full`} value={entry.caster} onChange={(event) => onChange({ ...entry, caster: event.target.value as ClassEntry["caster"] })}>
          <option value="none">None</option>
          <option value="full">Full caster</option>
          <option value="half">Half caster</option>
          <option value="third">Third caster</option>
          <option value="pact">Pact Magic</option>
        </select>
      </label>
      {entry.caster !== "none" ? (
        <label className="block text-xs text-muted">
          Ability
          <select
            className={`${inputBaseClass} mt-1 h-10 w-full`}
            value={entry.spellAbility ?? ""}
            onChange={(event) => onChange({ ...entry, spellAbility: (event.target.value || null) as ClassEntry["spellAbility"] })}
          >
            <option value="">—</option>
            {ABILITIES.map((a) => (
              <option key={a} value={a}>
                {ABILITY_NAMES[a]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {entry.caster !== "none" ? (
        <label className="block text-xs text-muted">
          Prepared max
          <input
            inputMode="numeric"
            className={`${inputBaseClass} mt-1 h-10 w-full`}
            placeholder="auto"
            value={entry.preparedMax ?? ""}
            onChange={(event) => onChange({ ...entry, preparedMax: event.target.value === "" ? null : Math.max(0, Math.min(99, Math.trunc(Number(event.target.value)) || 0)) })}
          />
        </label>
      ) : null}
      {canRemove ? (
        <div className="flex items-end">
          <Button size="icon" variant="danger-ghost" icon={Trash2} aria-label={`Remove ${entry.name}`} onClick={onRemove} />
        </div>
      ) : null}
    </div>
  );
}

export function MainTab({ sheet, editing }: { sheet: SheetHandle; editing: boolean }) {
  const { body, derived, vitals, update, apply } = sheet;
  const total = body.classes.reduce((n, c) => n + c.level, 0);

  return (
    <div className="space-y-4">
      {editing ? (
        <Section title="Character">
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
            <TextField label="Name" value={body.identity.name} max={120} onChange={(name) => update((b) => ({ ...b, identity: { ...b.identity, name: name || b.identity.name } }))} />
            <TextField label="Species" value={body.identity.species} max={120} onChange={(species) => update((b) => ({ ...b, identity: { ...b.identity, species } }))} />
            <TextField label="Background" value={body.identity.background} max={120} onChange={(background) => update((b) => ({ ...b, identity: { ...b.identity, background } }))} />
            <TextField label="Alignment" value={body.identity.alignment} max={40} onChange={(alignment) => update((b) => ({ ...b, identity: { ...b.identity, alignment } }))} />
            <label className="block text-xs text-muted">
              Size
              <select
                className={`${inputBaseClass} mt-1 h-10 w-full`}
                value={body.identity.size}
                onChange={(event) => update((b) => ({ ...b, identity: { ...b.identity, size: event.target.value as typeof b.identity.size } }))}
              >
                {(["Tiny", "Small", "Medium", "Large"] as const).map((size) => (
                  <option key={size}>{size}</option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <NumberField label="XP" value={body.identity.xp} min={0} max={10_000_000} className="flex-1" onChange={(xp) => update((b) => ({ ...b, identity: { ...b.identity, xp } }))} />
              <label className="flex items-center gap-1.5 pb-3 text-xs text-muted">
                <input type="checkbox" className="accent-[var(--accent)]" checked={body.identity.milestone} onChange={(event) => update((b) => ({ ...b, identity: { ...b.identity, milestone: event.target.checked } }))} />
                Milestone
              </label>
            </div>
          </div>
          <datalist id="srd-classes">
            {SRD_CLASSES.map((c) => (
              <option key={c.name} value={c.name} />
            ))}
          </datalist>
          <div className="space-y-2">
            {body.classes.map((entry, index) => (
              <ClassRow
                key={entry.id}
                entry={entry}
                canRemove={body.classes.length > 1}
                onChange={(next) => update((b) => ({ ...b, classes: b.classes.map((c, i) => (i === index ? next : c)) }))}
                onRemove={() => update((b) => ({ ...b, classes: b.classes.filter((_, i) => i !== index) }))}
              />
            ))}
            {body.classes.length < 6 && total < 20 ? (
              <Button
                size="sm"
                icon={Plus}
                onClick={() =>
                  update((b) => ({
                    ...b,
                    classes: [...b.classes, { id: newLocalId(), name: "Rogue", subclass: "", level: 1, hitDie: 8, caster: "none", spellAbility: null, preparedMax: null, saveProficiencies: ["dex", "int"] }],
                  }))
                }
              >
                Multiclass
              </Button>
            ) : null}
            {total > 20 ? <p className="text-xs text-danger">Class levels add up to more than 20; the sheet will not save until that is fixed.</p> : null}
          </div>
        </Section>
      ) : null}

      <Section title="Abilities">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ABILITIES.map((a) => {
            const entry = body.abilities[a];
            return (
              <div key={a} className="rounded-2xl border border-border bg-bg/30 p-2 text-center">
                <div className="text-xs font-medium uppercase text-muted">{a}</div>
                <RollButton bonus={derived.abilities[a].mod} label={`${ABILITY_NAMES[a]} check`} className="text-2xl" />
                <div className="text-xs text-faint">{derived.abilities[a].score}</div>
                {editing ? (
                  <div className="mt-1 space-y-1">
                    <NumberField label="Base" value={entry.base} min={1} max={30} onChange={(base) => update((b) => ({ ...b, abilities: { ...b.abilities, [a]: { ...b.abilities[a], base } } }))} />
                    <NumberField label="Bonus" value={entry.bonus} min={-10} max={10} onChange={(bonus) => update((b) => ({ ...b, abilities: { ...b.abilities, [a]: { ...b.abilities[a], bonus } } }))} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Section>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Section title="Combat">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div title={derived.ac.why}>
              <dt className="text-xs text-muted">Armor class</dt>
              <dd className="text-xl font-semibold">{derived.ac.value}</dd>
            </div>
            <div title={derived.initiative.why}>
              <dt className="text-xs text-muted">Initiative</dt>
              <dd className="text-xl">
                <RollButton bonus={derived.initiative.bonus} label="Initiative" />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Proficiency</dt>
              <dd className="text-xl font-semibold">{signed(derived.proficiency)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Speed</dt>
              <dd className="font-semibold">
                {derived.speed.walk} ft
                {(["fly", "swim", "climb", "burrow"] as const).filter((k) => derived.speed[k]).map((k) => ` · ${k} ${derived.speed[k]}`)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Passive Perception</dt>
              <dd className="font-semibold">{derived.passive.perception}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Level</dt>
              <dd className="font-semibold">{derived.totalLevel}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2 text-sm">
            {derived.hitDice.map((pool) => (
              <Button
                key={pool.die}
                size="sm"
                disabled={pool.left < 1}
                onClick={() => void apply([{ op: "spendHitDie", die: pool.die, roll: true }])}
                title="Spend one and heal: roll it plus your Constitution modifier"
              >
                Hit dice d{pool.die}: {pool.left}/{pool.total}
              </Button>
            ))}
          </div>
          {editing ? (
            <div className="grid gap-2 grid-cols-1 sm:grid-cols-3">
              <label className="block text-xs text-muted">
                AC rule
                <select
                  className={`${inputBaseClass} mt-1 h-10 w-full`}
                  value={body.combat.ac.mode}
                  onChange={(event) => {
                    const mode = event.target.value;
                    update((b) => ({
                      ...b,
                      combat: {
                        ...b.combat,
                        ac:
                          mode === "manual"
                            ? { mode: "manual", value: derived.ac.value }
                            : mode === "armor"
                              ? { mode: "armor", base: 11, dexCap: null, shield: false, bonus: 0 }
                              : { mode: "unarmored", extra: null, bonus: 0 },
                      },
                    }));
                  }}
                >
                  <option value="unarmored">Unarmored (10 + Dex)</option>
                  <option value="armor">Armor</option>
                  <option value="manual">Set by hand</option>
                </select>
              </label>
              {body.combat.ac.mode === "manual" ? (
                <NumberField label="AC" value={body.combat.ac.value} min={0} max={40} onChange={(value) => update((b) => ({ ...b, combat: { ...b.combat, ac: { mode: "manual", value } } }))} />
              ) : body.combat.ac.mode === "armor" ? (
                <>
                  <NumberField label="Armor base" value={body.combat.ac.base} min={0} max={30} onChange={(base) => update((b) => (b.combat.ac.mode === "armor" ? { ...b, combat: { ...b.combat, ac: { ...b.combat.ac, base } } } : b))} />
                  <label className="block text-xs text-muted">
                    Dex cap
                    <select
                      className={`${inputBaseClass} mt-1 h-10 w-full`}
                      value={body.combat.ac.dexCap ?? ""}
                      onChange={(event) => update((b) => (b.combat.ac.mode === "armor" ? { ...b, combat: { ...b.combat, ac: { ...b.combat.ac, dexCap: event.target.value === "" ? null : Number(event.target.value) } } } : b))}
                    >
                      <option value="">No cap (light)</option>
                      <option value="2">+2 (medium)</option>
                      <option value="0">None (heavy)</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      className="accent-[var(--accent)]"
                      checked={body.combat.ac.shield}
                      onChange={(event) => update((b) => (b.combat.ac.mode === "armor" ? { ...b, combat: { ...b.combat, ac: { ...b.combat.ac, shield: event.target.checked } } } : b))}
                    />
                    Shield (+2)
                  </label>
                </>
              ) : (
                <label className="block text-xs text-muted">
                  Plus ability
                  <select
                    className={`${inputBaseClass} mt-1 h-10 w-full`}
                    value={body.combat.ac.extra ?? ""}
                    onChange={(event) => update((b) => (b.combat.ac.mode === "unarmored" ? { ...b, combat: { ...b.combat, ac: { ...b.combat.ac, extra: (event.target.value || null) as never } } } : b))}
                  >
                    <option value="">Nothing</option>
                    <option value="con">Constitution (Barbarian)</option>
                    <option value="wis">Wisdom (Monk)</option>
                  </select>
                </label>
              )}
              <NumberField label="Initiative bonus" value={body.combat.initiativeBonus} min={-20} max={30} onChange={(initiativeBonus) => update((b) => ({ ...b, combat: { ...b.combat, initiativeBonus } }))} />
              <NumberField label="Walking speed" value={body.combat.speed.walk} min={0} max={500} onChange={(walk) => update((b) => ({ ...b, combat: { ...b.combat, speed: { ...b.combat.speed, walk } } }))} />
              <label className="block text-xs text-muted">
                Hit points
                <select
                  className={`${inputBaseClass} mt-1 h-10 w-full`}
                  value={body.combat.hp.mode}
                  onChange={(event) =>
                    update((b) => ({ ...b, combat: { ...b.combat, hp: event.target.value === "manual" ? { mode: "manual", max: derived.maxHp } : { mode: "average", bonusPerLevel: 0, bonus: 0 } } }))
                  }
                >
                  <option value="average">Average per level</option>
                  <option value="manual">Set by hand</option>
                </select>
              </label>
              {body.combat.hp.mode === "manual" ? (
                <NumberField label="Max HP" value={body.combat.hp.max} min={1} max={2000} onChange={(max) => update((b) => ({ ...b, combat: { ...b.combat, hp: { mode: "manual", max } } }))} />
              ) : (
                <NumberField
                  label="HP bonus per level"
                  value={body.combat.hp.bonusPerLevel}
                  min={-10}
                  max={20}
                  onChange={(bonusPerLevel) => update((b) => (b.combat.hp.mode === "average" ? { ...b, combat: { ...b.combat, hp: { ...b.combat.hp, bonusPerLevel } } } : b))}
                />
              )}
            </div>
          ) : null}
          {vitals.exhaustion > 0 ? <Badge tone="warn">Exhaustion {vitals.exhaustion}: {derived.exhaustion.d20Penalty ? `${derived.exhaustion.d20Penalty} to d20 tests` : "see the rules"}</Badge> : null}
        </Section>

        <Section title="Saving throws">
          <ul className="grid grid-cols-2 gap-1 text-sm">
            {ABILITIES.map((a) => (
              <li key={a} className="flex items-center justify-between rounded-lg px-2 py-1 hover:bg-surface-2" title={derived.saves[a].why}>
                <span>
                  {derived.saves[a].proficient ? "● " : ""}
                  {ABILITY_NAMES[a]}
                </span>
                <RollButton bonus={derived.saves[a].bonus} label={`${ABILITY_NAMES[a]} save`} />
              </li>
            ))}
          </ul>
          {editing ? (
            <ListField
              label="Extra save proficiencies (str, dex…)"
              value={body.proficiencies.saves}
              onChange={(list) => update((b) => ({ ...b, proficiencies: { ...b.proficiencies, saves: list.filter((x): x is (typeof ABILITIES)[number] => (ABILITIES as readonly string[]).includes(x)) } }))}
            />
          ) : null}
        </Section>
      </div>

      <Section
        title="Skills"
        action={
          editing ? (
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                className="accent-[var(--accent)]"
                checked={body.proficiencies.jackOfAllTrades}
                onChange={(event) => update((b) => ({ ...b, proficiencies: { ...b.proficiencies, jackOfAllTrades: event.target.checked } }))}
              />
              Jack of All Trades
            </label>
          ) : null
        }
      >
        <ul className="grid gap-1 text-sm grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {SKILL_IDS.map((skill) => {
            const info = derived.skills[skill];
            return (
              <li key={skill} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-surface-2" title={info.why}>
                <span className="flex items-center gap-1.5">
                  {editing ? (
                    <select
                      aria-label={`${SKILLS[skill].name} proficiency`}
                      className={`${inputBaseClass} h-7 px-1 text-xs`}
                      value={info.level}
                      onChange={(event) => update((b) => ({ ...b, proficiencies: { ...b.proficiencies, skills: { ...b.proficiencies.skills, [skill]: event.target.value as (typeof LEVELS)[number] } } }))}
                    >
                      {LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="w-3 text-accent">{LEVEL_MARK[info.level]}</span>
                  )}
                  {SKILLS[skill].name}
                  <span className="text-xs uppercase text-faint">{SKILLS[skill].ability}</span>
                </span>
                <RollButton bonus={info.bonus} label={SKILLS[skill].name} />
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Proficiencies and languages">
        {editing ? (
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
            <ListField label="Armor" value={body.proficiencies.armor} onChange={(armor) => update((b) => ({ ...b, proficiencies: { ...b.proficiencies, armor } }))} />
            <ListField label="Weapons" value={body.proficiencies.weapons} onChange={(weapons) => update((b) => ({ ...b, proficiencies: { ...b.proficiencies, weapons } }))} />
            <ListField label="Tools" value={body.proficiencies.tools} onChange={(tools) => update((b) => ({ ...b, proficiencies: { ...b.proficiencies, tools } }))} />
            <ListField label="Languages" value={body.proficiencies.languages} onChange={(languages) => update((b) => ({ ...b, proficiencies: { ...b.proficiencies, languages } }))} />
            <TextField label="Senses" value={body.combat.senses} max={200} onChange={(senses) => update((b) => ({ ...b, combat: { ...b.combat, senses } }))} />
            <ListField label="Resistances" value={body.combat.resistances} max={20} onChange={(resistances) => update((b) => ({ ...b, combat: { ...b.combat, resistances } }))} />
          </div>
        ) : (
          <dl className="grid gap-2 text-sm grid-cols-1 sm:grid-cols-2">
            {(
              [
                ["Armor", body.proficiencies.armor],
                ["Weapons", body.proficiencies.weapons],
                ["Tools", body.proficiencies.tools],
                ["Languages", body.proficiencies.languages],
                ["Resistances", body.combat.resistances],
              ] as const
            ).map(([label, list]) => (
              <div key={label}>
                <dt className="text-xs text-muted">{label}</dt>
                <dd>{list.length ? list.join(", ") : "—"}</dd>
              </div>
            ))}
            {body.combat.senses ? (
              <div>
                <dt className="text-xs text-muted">Senses</dt>
                <dd>{body.combat.senses}</dd>
              </div>
            ) : null}
          </dl>
        )}
      </Section>
    </div>
  );
}
