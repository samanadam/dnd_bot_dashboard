import { z } from "zod";
import { slugFromKey } from "./open5e";
import { itemBlockSchema, type ItemBlock } from "./items";

// Converts one Open5e v2 item or magic item into this portal's item format. Used
// only by scripts/import-srd-items.mts; the portal itself never calls Open5e.

/** The only Open5e documents whose items may be bundled: both are CC-BY-4.0. */
export const SRD_ITEM_DOCUMENTS = { "srd-2014": "2014", "srd-2024": "2024" } as const;
export type SrdItemDocument = keyof typeof SRD_ITEM_DOCUMENTS;

export function isSrdItemDocument(key: unknown): key is SrdItemDocument {
  return typeof key === "string" && Object.hasOwn(SRD_ITEM_DOCUMENTS, key);
}

const named = z.object({ name: z.string() });

const open5eItemSchema = z.object({
  key: z.string(),
  name: z.string(),
  desc: z.string().nullish(),
  category: named.nullish(),
  rarity: named.nullish(),
  cost: z.string().nullish(),
  weight: z.string().nullish(),
  weight_unit: z.string().nullish(),
  requires_attunement: z.boolean().nullish(),
  attunement_detail: z.string().nullish(),
  weapon: z
    .object({
      damage_dice: z.string().nullish(),
      damage_type: named.nullish(),
      properties: z.array(z.object({ property: named, detail: z.string().nullish() })).default([]),
    })
    .nullish(),
  armor: z.object({ ac_display: z.string().nullish() }).nullish(),
  document: z.object({ key: z.string() }),
});

export type Open5eItem = z.infer<typeof open5eItemSchema>;

export function itemSlug(key: string): string {
  return slugFromKey(key);
}

function number(value: string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** Throws when the entry is not in the shape the importer expects. */
export function normaliseOpen5eItem(raw: unknown): ItemBlock {
  const item = open5eItemSchema.parse(raw);
  if (item.weight_unit && item.weight_unit !== "lb") throw new Error(`${item.key}: unexpected weight unit ${item.weight_unit}`);

  const details: string[] = [];
  if (item.weapon?.damage_dice) {
    details.push([item.weapon.damage_dice, item.weapon.damage_type?.name.toLowerCase()].filter(Boolean).join(" "));
  }
  if (item.weapon?.properties.length) {
    details.push(item.weapon.properties.map(({ property, detail }) => (detail ? `${property.name} (${detail})` : property.name)).join(", "));
  }
  if (item.armor?.ac_display) details.push(`AC ${item.armor.ac_display}`);

  return itemBlockSchema.parse({
    name: item.name,
    category: item.category?.name ?? "",
    rarity: item.rarity?.name ?? "",
    attunement: item.requires_attunement ? item.attunement_detail?.trim() || "Required" : "",
    costGp: number(item.cost),
    weightLb: number(item.weight),
    detail: details.join(" · "),
    description: item.desc ?? "",
  });
}
