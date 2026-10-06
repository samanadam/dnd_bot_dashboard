"use client";

import { Backpack, Plus, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, inputBaseClass } from "@/components/ui";
import type { SheetItem } from "@/lib/sheets/body";
import { newLocalId, NumberField, Section, TextField } from "./bits";
import type { SheetHandle } from "./useSheet";

const COINS = ["pp", "gp", "ep", "sp", "cp"] as const;

export function InventoryTab({ sheet, editing }: { sheet: SheetHandle; editing: boolean }) {
  const { body, derived, update } = sheet;
  const items = body.inventory.items;
  const setItem = (id: string, change: (item: SheetItem) => SheetItem) =>
    update((b) => ({ ...b, inventory: { ...b.inventory, items: b.inventory.items.map((item) => (item.id === id ? change(item) : item)) } }));

  return (
    <div className="space-y-4">
      <Section title="Coins">
        <div className="grid grid-cols-5 gap-2">
          {COINS.map((coin) => (
            <NumberField
              key={coin}
              label={coin.toUpperCase()}
              value={body.inventory.currency[coin]}
              min={0}
              max={10_000_000}
              onChange={(value) => update((b) => ({ ...b, inventory: { ...b.inventory, currency: { ...b.inventory.currency, [coin]: value } } }))}
            />
          ))}
        </div>
      </Section>

      <Section
        title="Items"
        action={
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className={derived.attunement.used > derived.attunement.max ? "text-danger" : ""}>
              Attuned {derived.attunement.used}/{derived.attunement.max}
            </span>
            <span className={derived.carrying.state === "fine" ? "" : "text-warn"}>
              {derived.carrying.weight} lb{body.inventory.encumbrance !== "off" ? ` of ${derived.carrying.capacity}` : ""}
              {derived.carrying.state !== "fine" ? ` · ${derived.carrying.state === "over" ? "over capacity" : `${derived.carrying.state} encumbered`}` : ""}
            </span>
            {items.length < 300 ? (
              <Button
                size="sm"
                icon={Plus}
                onClick={() =>
                  update((b) => ({
                    ...b,
                    inventory: { ...b.inventory, items: [...b.inventory.items, { id: newLocalId(), name: "New item", ref: null, qty: 1, weightLb: 0, equipped: false, attuned: false, container: "", notes: "" }] },
                  }))
                }
              >
                Item
              </Button>
            ) : null}
          </div>
        }
      >
        {items.length === 0 ? (
          <EmptyState icon={Backpack} title="Nothing carried">
            Add gear, loot and magic items.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="py-2">
                {editing ? (
                  <div className="grid gap-2 sm:grid-cols-6">
                    <div className="sm:col-span-2">
                      <TextField label="Name" value={item.name} max={120} onChange={(name) => setItem(item.id, (it) => ({ ...it, name: name || it.name }))} />
                    </div>
                    <NumberField label="Qty" value={item.qty} min={0} max={9999} onChange={(qty) => setItem(item.id, (it) => ({ ...it, qty }))} />
                    <label className="block text-xs text-muted">
                      Weight (lb)
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className={`${inputBaseClass} mt-1 h-10 w-full`}
                        value={item.weightLb}
                        onChange={(event) => setItem(item.id, (it) => ({ ...it, weightLb: Math.max(0, Math.min(10_000, Number(event.target.value) || 0)) }))}
                      />
                    </label>
                    <TextField label="Where" value={item.container} max={60} onChange={(container) => setItem(item.id, (it) => ({ ...it, container }))} />
                    <div className="flex items-end justify-end">
                      <Button
                        size="icon"
                        variant="danger-ghost"
                        icon={Trash2}
                        aria-label={`Remove ${item.name}`}
                        onClick={() => update((b) => ({ ...b, inventory: { ...b.inventory, items: b.inventory.items.filter((it) => it.id !== item.id) } }))}
                      />
                    </div>
                    <div className="sm:col-span-6">
                      <TextField label="Notes" value={item.notes} max={1000} onChange={(notes) => setItem(item.id, (it) => ({ ...it, notes }))} />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{item.name}</span>
                      {item.qty !== 1 ? <span className="text-muted"> ×{item.qty}</span> : null}
                      {item.notes ? <span className="block truncate text-xs text-muted">{item.notes}</span> : null}
                    </span>
                    {item.container ? <Badge>{item.container}</Badge> : null}
                    <label className="flex items-center gap-1 text-xs text-muted">
                      <input type="checkbox" className="accent-[var(--accent)]" checked={item.equipped} onChange={(event) => setItem(item.id, (it) => ({ ...it, equipped: event.target.checked }))} />
                      Equipped
                    </label>
                    <label className="flex items-center gap-1 text-xs text-muted">
                      <input type="checkbox" className="accent-[var(--accent)]" checked={item.attuned} onChange={(event) => setItem(item.id, (it) => ({ ...it, attuned: event.target.checked }))} />
                      Attuned
                    </label>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {editing ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <NumberField label="Attunement slots" value={body.inventory.attunementMax} min={0} max={6} onChange={(attunementMax) => update((b) => ({ ...b, inventory: { ...b.inventory, attunementMax } }))} />
            <label className="block text-xs text-muted">
              Carrying
              <select
                className={`${inputBaseClass} mt-1 h-10 w-full`}
                value={body.inventory.encumbrance}
                onChange={(event) => update((b) => ({ ...b, inventory: { ...b.inventory, encumbrance: event.target.value as typeof b.inventory.encumbrance } }))}
              >
                <option value="off">Do not track</option>
                <option value="simple">Capacity only</option>
                <option value="variant">Encumbrance (variant)</option>
              </select>
            </label>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
