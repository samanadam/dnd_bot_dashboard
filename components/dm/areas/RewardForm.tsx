"use client";

import { Save, X } from "lucide-react";
import { useState } from "react";
import { Button, Field, Notice, inputBaseClass, inputClass } from "@/components/ui";
import type { BattleView, RewardView } from "@/lib/dm/areaView";
import type { CreatureRef } from "@/lib/dm/encounter";
import type { ItemRef } from "@/lib/dm/items";
import { rewardInputSchema, type RewardInput } from "@/lib/dm/rewards";
import { ItemPicker, NpcPicker } from "./Pickers";

/** Add or edit one reward. The item or NPC is picked from a list; nothing about them is typed in. */
export function RewardForm({
  kind,
  initial,
  battles,
  campaign,
  onSubmit,
  onCancel,
}: {
  kind: "item" | "pointer";
  initial?: RewardView;
  battles: BattleView[];
  campaign: string | null;
  onSubmit: (reward: RewardInput) => void;
  onCancel: () => void;
}) {
  const existingItem = initial?.kind === "item" ? initial : null;
  const existingPointer = initial?.kind === "pointer" ? initial : null;

  const [encounterId, setEncounterId] = useState<string | null>(initial?.encounterId ?? null);
  const [item, setItem] = useState<{ ref: ItemRef; label: string } | null>(
    existingItem ? { ref: existingItem.itemRef, label: existingItem.resolved?.name ?? "Missing item" } : null,
  );
  const [quantity, setQuantity] = useState(existingItem?.quantity ?? 1);
  const [note, setNote] = useState(existingItem?.note ?? "");
  const [title, setTitle] = useState(existingPointer?.title ?? "");
  const [condition, setCondition] = useState(existingPointer?.condition ?? "");
  const [outcome, setOutcome] = useState(existingPointer?.outcome ?? "");
  const [npc, setNpc] = useState<{ ref: CreatureRef; label: string } | null>(
    existingPointer?.npcRef ? { ref: existingPointer.npcRef, label: existingPointer.resolved?.name ?? "Missing creature" } : null,
  );
  const [pickingNpc, setPickingNpc] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const base = { ...(initial ? { id: initial.id } : {}), encounterId };
    const candidate =
      kind === "item"
        ? { kind, ...base, status: existingItem?.status ?? "planned", itemRef: item?.ref, quantity, note }
        : { kind, ...base, status: existingPointer?.status ?? "pending", title, condition, outcome, npcRef: npc?.ref ?? null };
    const parsed = rewardInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(kind === "item" && !item ? "Pick an item first." : `${parsed.error.issues[0]?.path.join(".") || "reward"}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
      return;
    }
    onSubmit(parsed.data);
  }

  const scope = (
    <Field label="Comes from">
      <select className={`${inputBaseClass} h-11 w-full`} value={encounterId ?? ""} onChange={(event) => setEncounterId(event.target.value || null)}>
        <option value="">The area as a whole</option>
        {battles.map((battle) => (
          <option key={battle.id} value={battle.id}>
            {battle.name ?? "Missing battle"}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <form
      className="space-y-4 rounded-3xl border border-accent/40 bg-surface p-4 shadow-card sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h3 className="font-display text-lg font-semibold">{initial ? "Edit" : "Add"} {kind === "item" ? "item reward" : "pointer"}</h3>

      {kind === "item" ? (
        <>
          {item ? (
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-bg/40 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
              <Button size="sm" variant="ghost" onClick={() => setItem(null)}>
                Change
              </Button>
            </div>
          ) : (
            <ItemPicker campaign={campaign} onPick={(result) => setItem({ ref: result.ref, label: result.name })} />
          )}
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <Field label="Quantity">
              <input className={inputClass} type="number" min={1} max={9999} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.floor(Number(event.target.value)) || 1))} />
            </Field>
            <Field label="Note" hint="Where it is found, who carries it.">
              <input className={inputClass} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
            </Field>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">A social outcome the party earns by doing something: an ally, a favour, a debt.</p>
          <Field label="Title">
            <input className={inputClass} value={title} maxLength={120} placeholder="Friends of the village" onChange={(event) => setTitle(event.target.value)} autoFocus />
          </Field>
          <Field label="If the party…" hint="The condition.">
            <textarea className={`${inputBaseClass} min-h-16 w-full py-2.5`} value={condition} maxLength={500} placeholder="saves the mayor from the goblins" onChange={(event) => setCondition(event.target.value)} />
          </Field>
          <Field label="…then" hint="What follows in the campaign.">
            <textarea className={`${inputBaseClass} min-h-20 w-full py-2.5`} value={outcome} maxLength={2000} placeholder="The village shelters them in act 3." onChange={(event) => setOutcome(event.target.value)} />
          </Field>
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted">Linked NPC (optional)</span>
            {npc ? (
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-bg/40 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{npc.label}</span>
                <Button size="sm" variant="ghost" onClick={() => setNpc(null)}>
                  Remove
                </Button>
              </div>
            ) : pickingNpc ? (
              <NpcPicker
                campaign={campaign}
                onPick={(result) => {
                  setNpc({ ref: result.ref, label: result.name });
                  setPickingNpc(false);
                }}
              />
            ) : (
              <Button size="sm" onClick={() => setPickingNpc(true)}>
                Link an NPC
              </Button>
            )}
          </div>
        </>
      )}

      {battles.length ? scope : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex justify-end gap-2">
        <Button icon={X} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" icon={Save}>
          {initial ? "Save reward" : "Add reward"}
        </Button>
      </div>
    </form>
  );
}
