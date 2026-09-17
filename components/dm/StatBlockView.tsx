import { Dices, Footprints, Heart, Shield, Swords, Zap } from "lucide-react";
import type { ReactNode } from "react";
import {
  ABILITIES,
  ABILITY_NAMES,
  abilityModifier,
  formatModifier,
  initiativeBonus,
  type Feature,
  type StatBlock,
} from "@/lib/dm/statblock";

// Renders a stat block. Pure presentation: when `onRoll` is given, every number
// that can be rolled (attacks, damage, checks, saves, hit dice, initiative)
// becomes a button that hands a dice expression back to the caller.

export type RollFn = (label: string, expression: string) => void;

function RollChip({
  onRoll,
  label,
  expression,
  children,
  tone = "default",
  title,
}: {
  onRoll?: RollFn;
  label: string;
  expression: string;
  children: ReactNode;
  tone?: "default" | "attack" | "damage";
  title?: string;
}) {
  const tones = {
    default: "border-border bg-surface-2 text-text hover:border-accent hover:text-accent",
    attack: "border-accent/30 bg-accent-soft text-accent hover:border-accent",
    damage: "border-border-strong bg-surface-3 text-text hover:border-accent hover:text-accent",
  };
  const className = `inline-flex items-center gap-1 rounded-lg border px-1.5 py-0.5 align-baseline text-xs font-medium tabular-nums leading-5 transition ${tones[tone]}`;
  if (!onRoll) return <span className={className.replace(/hover:\S+/g, "")}>{children}</span>;
  return (
    <button type="button" className={className} title={title ?? `Roll ${expression}`} aria-label={`Roll ${label}: ${expression}`} onClick={() => onRoll(label, expression)}>
      {children}
    </button>
  );
}

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(7.5rem,auto)_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-xs font-semibold uppercase tracking-wide text-faint">{label}</dt>
      <dd className="min-w-0 text-text">{children}</dd>
    </div>
  );
}

function Section({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-display text-lg font-semibold tracking-wide text-accent">{title}</h3>
        <hr className="tome-rule mt-1" />
      </div>
      {intro ? <p className="text-sm italic text-muted">{intro}</p> : null}
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function FeatureEntry({ feature, owner, onRoll }: { feature: Feature; owner: string; onRoll?: RollFn }) {
  const attack = feature.attack;
  const damage = attack ? [attack.damage, attack.extraDamage].filter(Boolean).join("+") : "";
  return (
    <div className="text-sm leading-relaxed">
      <p>
        <span className="font-display text-base font-semibold italic text-text">{feature.name}.</span>{" "}
        <span className="whitespace-pre-line text-muted">{feature.desc}</span>
      </p>
      {attack ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <RollChip onRoll={onRoll} label={`${feature.name} to hit`} expression={`1d20${formatModifier(attack.toHit)}`} tone="attack">
            <Swords className="size-3" aria-hidden />
            {formatModifier(attack.toHit)} to hit
          </RollChip>
          {damage ? (
            <RollChip onRoll={onRoll} label={`${feature.name} damage`} expression={damage} tone="damage">
              <Dices className="size-3" aria-hidden />
              {attack.damage}
              {attack.damageType ? ` ${attack.damageType.toLowerCase()}` : ""}
              {attack.extraDamage ? ` + ${attack.extraDamage}${attack.extraDamageType ? ` ${attack.extraDamageType.toLowerCase()}` : ""}` : ""}
            </RollChip>
          ) : null}
        </div>
      ) : null}
      <span className="sr-only">({owner})</span>
    </div>
  );
}

export function StatBlockView({ block, onRoll, compact = false }: { block: StatBlock; onRoll?: RollFn; compact?: boolean }) {
  const init = initiativeBonus(block);
  const saves = Object.entries(block.saves) as [keyof StatBlock["saves"], number][];
  const skills = Object.entries(block.skills);
  const defenses = [
    ["Vulnerabilities", block.damageVulnerabilities],
    ["Resistances", block.damageResistances],
    ["Immunities", block.damageImmunities],
    ["Condition immunities", block.conditionImmunities],
  ].filter(([, value]) => value);

  return (
    <article className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={`font-display font-bold leading-tight tracking-tight text-text ${compact ? "text-2xl" : "text-3xl sm:text-4xl"}`}>
            {block.name}
          </h2>
          <p className="mt-1 text-sm italic text-muted">{[block.size, block.type, block.alignment].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="shrink-0 rounded-2xl border border-accent/30 bg-accent-soft px-3 py-1.5 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-accent">Challenge</div>
          <div className="font-display text-xl font-bold leading-none text-text">{block.cr}</div>
          <div className="text-[10px] tabular-nums text-muted">{block.xp.toLocaleString("en")} XP</div>
        </div>
      </header>

      <div className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
        <div className="rounded-2xl border border-border bg-surface-2 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted"><Shield className="size-3.5" aria-hidden /> Armor Class</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{block.ac}</div>
          {block.acNote ? <div className="truncate text-xs text-faint" title={block.acNote}>{block.acNote}</div> : null}
        </div>
        <div className="rounded-2xl border border-border bg-surface-2 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted"><Heart className="size-3.5" aria-hidden /> Hit Points</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{block.hp}</div>
          {block.hitDice ? (
            <RollChip onRoll={onRoll} label="Hit points" expression={block.hitDice} title="Roll hit points">
              {block.hitDice}
            </RollChip>
          ) : null}
        </div>
        <div className="rounded-2xl border border-border bg-surface-2 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted"><Footprints className="size-3.5" aria-hidden /> Speed</div>
          <div className="mt-1 text-sm font-medium leading-snug">{block.speed || "—"}</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface-2 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted"><Zap className="size-3.5" aria-hidden /> Initiative</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{formatModifier(init)}</div>
          <RollChip onRoll={onRoll} label="Initiative" expression={`1d20${formatModifier(init)}`}>
            Roll
          </RollChip>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {ABILITIES.map((ability) => {
          const mod = abilityModifier(block.abilities[ability]);
          const save = block.saves[ability];
          return (
            <div key={ability} className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-surface-2 px-2 py-2.5 text-center">
              <abbr title={ABILITY_NAMES[ability]} className="text-[11px] font-semibold uppercase tracking-widest text-faint no-underline">
                {ability}
              </abbr>
              <span className="text-xl font-semibold tabular-nums leading-none">{block.abilities[ability]}</span>
              <RollChip onRoll={onRoll} label={`${ABILITY_NAMES[ability]} check`} expression={`1d20${formatModifier(mod)}`}>
                {formatModifier(mod)}
              </RollChip>
              {save !== undefined ? (
                <RollChip onRoll={onRoll} label={`${ABILITY_NAMES[ability]} save`} expression={`1d20${formatModifier(save)}`} tone="attack">
                  save {formatModifier(save)}
                </RollChip>
              ) : null}
            </div>
          );
        })}
      </div>

      <dl className="divide-y divide-border rounded-2xl border border-border px-4 py-1">
        {saves.length === 0 && skills.length === 0 && defenses.length === 0 && !block.senses && !block.languages ? (
          <Property label="Details">—</Property>
        ) : null}
        {skills.length ? (
          <Property label="Skills">
            <span className="flex flex-wrap gap-1.5">
              {skills.map(([skill, bonus]) => (
                <RollChip key={skill} onRoll={onRoll} label={`${skill.replace(/_/g, " ")} check`} expression={`1d20${formatModifier(bonus)}`}>
                  <span className="capitalize">{skill.replace(/_/g, " ")}</span> {formatModifier(bonus)}
                </RollChip>
              ))}
            </span>
          </Property>
        ) : null}
        {defenses.map(([label, value]) => (
          <Property key={label} label={label}>
            {value}
          </Property>
        ))}
        {block.senses ? <Property label="Senses">{block.senses}</Property> : null}
        {block.languages ? <Property label="Languages">{block.languages}</Property> : null}
        {block.proficiencyBonus !== undefined ? <Property label="Proficiency">{formatModifier(block.proficiencyBonus)}</Property> : null}
      </dl>

      {block.traits.length ? (
        <Section title="Traits">
          {block.traits.map((feature, i) => <FeatureEntry key={`${feature.name}-${i}`} feature={feature} owner={block.name} onRoll={onRoll} />)}
        </Section>
      ) : null}
      {block.actions.length ? (
        <Section title="Actions">
          {block.actions.map((feature, i) => <FeatureEntry key={`${feature.name}-${i}`} feature={feature} owner={block.name} onRoll={onRoll} />)}
        </Section>
      ) : null}
      {block.bonusActions.length ? (
        <Section title="Bonus Actions">
          {block.bonusActions.map((feature, i) => <FeatureEntry key={`${feature.name}-${i}`} feature={feature} owner={block.name} onRoll={onRoll} />)}
        </Section>
      ) : null}
      {block.reactions.length ? (
        <Section title="Reactions">
          {block.reactions.map((feature, i) => <FeatureEntry key={`${feature.name}-${i}`} feature={feature} owner={block.name} onRoll={onRoll} />)}
        </Section>
      ) : null}
      {block.legendaryActions.length ? (
        <Section title="Legendary Actions" intro={block.legendaryDescription}>
          {block.legendaryActions.map((feature, i) => <FeatureEntry key={`${feature.name}-${i}`} feature={feature} owner={block.name} onRoll={onRoll} />)}
        </Section>
      ) : null}
    </article>
  );
}
