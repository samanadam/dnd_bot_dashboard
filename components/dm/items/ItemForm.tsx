"use client";

import { Save, X } from "lucide-react";
import { useState } from "react";
import { CampaignSelect } from "@/components/CampaignSelect";
import { useToast } from "@/components/Providers";
import { Button, Field, Notice, inputBaseClass, inputClass } from "@/components/ui";
import { dm, DmError } from "@/lib/dm/client";
import { customItemSchema, type CustomItem, type CustomItemInput } from "@/lib/dm/items";

const RARITIES = ["", "Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact"];
const CATEGORIES = ["Weapon", "Armor", "Potion", "Scroll", "Ring", "Rod", "Staff", "Wand", "Wondrous Item", "Adventuring Gear", "Tools", "Trade Good"];

const EMPTY: CustomItemInput = {
  name: "",
  category: "",
  rarity: "",
  attunement: "",
  costGp: 0,
  weightLb: 0,
  detail: "",
  description: "",
};

/** Create or edit one of the DM's own items. */
export function ItemForm({
  item,
  defaultCampaign,
  onSaved,
  onCancel,
}: {
  item?: CustomItem;
  defaultCampaign: string | null;
  onSaved: (saved: CustomItem) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [value, setValue] = useState<CustomItemInput>(item ? { ...item } : EMPTY);
  const [campaignId, setCampaignId] = useState<string | null>(item ? item.campaignId : defaultCampaign);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof CustomItemInput>(key: K, next: CustomItemInput[K]) => setValue((current) => ({ ...current, [key]: next }));

  async function save() {
    // The same schema the server applies, so the message can point at the field.
    const parsed = customItemSchema.safeParse({ ...value, campaignId });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(`${issue?.path.join(".") || "item"}: ${issue?.message ?? "invalid"}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = item ? await dm.updateItem(item.id, parsed.data) : await dm.createItem(parsed.data);
      toast("ok", item ? "Item saved." : "Item added.");
      onSaved(saved);
    } catch (caught) {
      setError(caught instanceof DmError ? caught.message : "Could not save the item.");
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input className={inputClass} value={value.name} maxLength={120} onChange={(event) => set("name", event.target.value)} autoFocus />
        </Field>
        <Field label="Category">
          <input className={inputClass} list="item-categories" value={value.category} maxLength={60} onChange={(event) => set("category", event.target.value)} />
          <datalist id="item-categories">
            {CATEGORIES.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </Field>
        <Field label="Rarity">
          <select className={`${inputBaseClass} h-11 w-full`} value={value.rarity} onChange={(event) => set("rarity", event.target.value)}>
            {RARITIES.map((rarity) => (
              <option key={rarity} value={rarity}>
                {rarity || "None (ordinary gear)"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Attunement" hint="Leave empty when it needs none.">
          <input className={inputClass} value={value.attunement} maxLength={200} placeholder="Required, or by a spellcaster" onChange={(event) => set("attunement", event.target.value)} />
        </Field>
        <Field label="Value (gp)">
          <input className={inputClass} type="number" min={0} step="any" value={value.costGp} onChange={(event) => set("costGp", Number(event.target.value) || 0)} />
        </Field>
        <Field label="Weight (lb)">
          <input className={inputClass} type="number" min={0} step="any" value={value.weightLb} onChange={(event) => set("weightLb", Number(event.target.value) || 0)} />
        </Field>
      </div>
      <Field label="Mechanics" hint="One line: damage, armor class, charges.">
        <input className={inputClass} value={value.detail} maxLength={300} onChange={(event) => set("detail", event.target.value)} />
      </Field>
      <Field label="Description" hint="**bold**, _italic_ and lines starting with - work.">
        <textarea className={`${inputBaseClass} min-h-28 w-full py-2.5`} value={value.description} maxLength={20_000} onChange={(event) => set("description", event.target.value)} />
      </Field>
      <Field label="Campaign">
        <CampaignSelect value={campaignId} onChange={setCampaignId} label="Campaign" noneLabel="Not in a campaign" />
      </Field>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex justify-end gap-2">
        <Button icon={X} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" icon={Save} busy={busy} disabled={!value.name.trim()}>
          {item ? "Save item" : "Add item"}
        </Button>
      </div>
    </form>
  );
}
