import { Badge } from "@/components/ui";
import type { ItemBlock } from "@/lib/dm/items";
import { RichText } from "../RichText";

const RARITY_TONE: Record<string, "neutral" | "ok" | "warn" | "danger" | "accent"> = {
  common: "neutral",
  uncommon: "ok",
  rare: "accent",
  "very rare": "warn",
  legendary: "danger",
  artifact: "danger",
};

export function RarityBadge({ rarity }: { rarity: string }) {
  if (!rarity) return null;
  return <Badge tone={RARITY_TONE[rarity.toLocaleLowerCase("en")] ?? "neutral"}>{rarity}</Badge>;
}

function gp(value: number): string {
  return value >= 1 ? `${value.toLocaleString("en")} gp` : `${Math.round(value * 100)} cp`;
}

/** The full text of one item, as it appears when a row is opened. */
export function ItemBlockView({ item }: { item: ItemBlock }) {
  const facts = [
    item.category,
    item.costGp > 0 ? gp(item.costGp) : "",
    item.weightLb > 0 ? `${item.weightLb} lb` : "",
    item.attunement ? `Attunement: ${item.attunement}` : "",
  ].filter(Boolean);
  return (
    <div className="space-y-2 text-sm">
      {facts.length ? <p className="text-xs text-muted">{facts.join(" · ")}</p> : null}
      {item.detail ? <p className="font-medium">{item.detail}</p> : null}
      {item.description ? <RichText text={item.description} /> : <p className="text-muted">No description.</p>}
    </div>
  );
}
