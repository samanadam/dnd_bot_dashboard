"use client";

import { Gem, Plus, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/Providers";
import { Button } from "@/components/ui";
import { dm, DmError } from "@/lib/dm/client";
import type { AreaDetail, RewardView } from "@/lib/dm/areaView";
import { MAX_REWARDS, type RewardInput } from "@/lib/dm/rewards";
import { RarityBadge } from "../items/ItemBlockView";
import { RewardForm } from "./RewardForm";
import { StatusButtons, toInputs } from "./RewardsPanel";

/**
 * The loot of one prepared battle, shown on the battle's own page: the area's
 * rewards tied to it, with the same status ticks and add/edit/delete as the
 * area page. Saves go through the area, so the area's version is kept here.
 */
export function BattleRewards({ initial, battleId, campaign }: { initial: AreaDetail; battleId: string; campaign: string | null }) {
  const toast = useToast();
  const [detail, setDetail] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ editing?: RewardView } | null>(null);
  const { area } = detail;
  const mine = detail.rewards.filter((reward) => reward.encounterId === battleId);
  const full = detail.rewards.length >= MAX_REWARDS;

  async function run(work: () => Promise<AreaDetail>): Promise<boolean> {
    setBusy(true);
    try {
      setDetail(await work());
      return true;
    } catch (error) {
      if (error instanceof DmError && error.code === "conflict") {
        toast("danger", "This area was changed in another tab. It has been reloaded; try again.");
        try {
          setDetail(await dm.getArea(area.id));
        } catch {
          // The message above is enough.
        }
      } else {
        toast("danger", error instanceof DmError ? error.message : "Could not save.");
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  const replace = (rewards: RewardInput[]) => run(() => dm.setAreaRewards(area.id, area.version, rewards));

  return (
    <section className="space-y-3 rounded-3xl border border-border bg-surface p-4 shadow-card sm:p-5" aria-label="Loot">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-semibold">Loot</h2>
          <p className="text-xs text-muted">From {area.name}. Shared with the area page.</p>
        </div>
        <Button size="sm" icon={Plus} disabled={full || busy} onClick={() => setForm({})}>
          Item
        </Button>
      </div>

      {form ? (
        <RewardForm
          key={form.editing?.id ?? "new"}
          kind="item"
          initial={form.editing}
          battles={[]}
          defaultBattle={battleId}
          campaign={campaign}
          onCancel={() => setForm(null)}
          onSubmit={async (reward) => {
            const next = toInputs(detail.rewards);
            const at = form.editing ? detail.rewards.findIndex((entry) => entry.id === form.editing?.id) : -1;
            if (at >= 0) next[at] = reward;
            else next.push(reward);
            if (await replace(next)) setForm(null);
          }}
        />
      ) : null}

      {mine.length === 0 && !form ? <p className="text-sm text-muted">Nothing is planned here yet. Add the items the party can find.</p> : null}

      <ul className="space-y-2">
        {mine.map((reward) => (
          <li key={reward.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-bg/40 p-3">
            <Gem className="size-4 shrink-0 text-accent" aria-hidden />
            <div className="min-w-0 flex-1">
              {reward.kind === "item" ? (
                <>
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {reward.quantity > 1 ? <span className="tabular-nums">{reward.quantity} ×</span> : null}
                    {reward.resolved ? reward.resolved.name : <span className="text-warn">Missing item</span>}
                    {reward.resolved?.rarity ? <RarityBadge rarity={reward.resolved.rarity} /> : null}
                  </p>
                  {reward.note ? <p className="text-xs text-muted">{reward.note}</p> : null}
                </>
              ) : (
                <p className="text-sm font-medium">{reward.title}</p>
              )}
            </div>
            <StatusButtons reward={reward} onPick={(status) => void run(() => dm.setRewardStatus(area.id, reward.id, status))} />
            <div className="flex gap-1">
              {reward.kind === "item" ? (
                <Button size="icon" variant="ghost" className="size-8" icon={Pencil} aria-label="Edit item" disabled={busy} onClick={() => setForm({ editing: reward })} />
              ) : null}
              <Button
                size="icon"
                variant="danger-ghost"
                className="size-8"
                icon={Trash2}
                aria-label="Delete reward"
                disabled={busy}
                onClick={() => void replace(toInputs(detail.rewards).filter((_, position) => detail.rewards[position].id !== reward.id))}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
