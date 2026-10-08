import { Badge } from "@/components/ui";
import { spellLevelLine, type SpellBlock } from "@/lib/dm/spells";
import { RichText } from "../RichText";

const ABILITY_NAMES: Record<string, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };

export function componentsLine(spell: Pick<SpellBlock, "components">): string {
  const { verbal, somatic, material, materialText, materialCostGp, materialConsumed } = spell.components;
  const letters = [verbal ? "V" : "", somatic ? "S" : "", material ? "M" : ""].filter(Boolean).join(", ");
  if (!material || !materialText) return letters || "None";
  const notes = [materialCostGp ? `worth ${materialCostGp.toLocaleString("en")}+ gp` : "", materialConsumed ? "consumed" : ""].filter(Boolean);
  return `${letters} (${materialText}${notes.length ? `; ${notes.join(", ")}` : ""})`;
}

export function durationLine(spell: Pick<SpellBlock, "duration" | "concentration">): string {
  if (!spell.concentration) return spell.duration;
  const rest = spell.duration.replace(/^up to\s+/i, "");
  return `Concentration, up to ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`;
}

/** The full text of one spell, as it appears when a row is opened or on a sheet. */
export function SpellBlockView({ spell }: { spell: SpellBlock }) {
  const facts: [string, string][] = [
    ["Casting time", spell.castingTime + (spell.ritual ? " (ritual)" : "")],
    ["Range", spell.range],
    ["Components", componentsLine(spell)],
    ["Duration", durationLine(spell)],
  ];
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs italic text-muted">{spellLevelLine(spell)}</p>
      <dl className="grid gap-x-4 gap-y-1 grid-cols-1 sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt className="shrink-0 font-semibold">{label}</dt>
            <dd className="min-w-0 text-muted">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-1.5">
        {spell.attack ? <Badge tone="accent">{spell.attack === "melee" ? "Melee spell attack" : "Ranged spell attack"}</Badge> : null}
        {spell.save ? <Badge tone="warn">{ABILITY_NAMES[spell.save]} save</Badge> : null}
        {spell.effect ? (
          <Badge tone={spell.effect.kind === "healing" ? "ok" : "danger"}>
            {spell.effect.roll} {spell.effect.kind === "healing" ? "healing" : spell.effect.types.join("/") || "damage"}
          </Badge>
        ) : null}
        {spell.classes.map((name) => (
          <Badge key={name}>{name}</Badge>
        ))}
      </div>
      {spell.description ? <RichText text={spell.description} /> : <p className="text-muted">No description.</p>}
      {spell.higherLevel ? (
        <div>
          <p className="font-semibold">{spell.level === 0 ? "Cantrip upgrade" : "Using a higher-level spell slot"}</p>
          <RichText text={spell.higherLevel} />
        </div>
      ) : null}
      {spell.scaling ? (
        <table className="w-full max-w-xs text-xs">
          <caption className="mb-1 text-left font-semibold">{spell.scaling.by === "slot" ? "By slot level" : "By character level"}</caption>
          <tbody className="divide-y divide-border">
            {spell.scaling.steps.map((step) => (
              <tr key={step.at}>
                <td className="py-1 pr-3 text-muted">{spell.scaling!.by === "slot" ? `Slot ${step.at}` : `Level ${step.at}+`}</td>
                <td className="py-1 font-mono">{step.roll}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
