"use client";

import { ArrowDown, ArrowUp, Gem, HeartHandshake, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge, Button, EmptyState } from "@/components/ui";
import type { AreaDetail, RewardView } from "@/lib/dm/areaView";
import { ITEM_STATUSES, MAX_REWARDS, POINTER_STATUSES, type RewardInput } from "@/lib/dm/rewards";
import { RarityBadge } from "../items/ItemBlockView";
import { RewardForm } from "./RewardForm";

const STATUS_LABEL: Record<string, string> = {
  planned: "Planned",
  given: "Given",
  skipped: "Skipped",
  pending: "Pending",
  earned: "Earned",
  lost: "Lost",
};

/** What is sent back to the server: the rewards as stored, without the names looked up for display. */
export function toInputs(rewards: RewardView[]): RewardInput[] {
  return rewards.map((reward): RewardInput =>
    reward.kind === "item"
      ? {
          kind: "item",
          id: reward.id,
          encounterId: reward.encounterId,
          status: reward.status,
          itemRef: reward.itemRef,
          quantity: reward.quantity,
          note: reward.note,
        }
      : {
          kind: "pointer",
          id: reward.id,
          encounterId: reward.encounterId,
          status: reward.status,
          title: reward.title,
          condition: reward.condition,
          outcome: reward.outcome,
          npcRef: reward.npcRef,
        },
  );
}

function StatusButtons({ reward, onPick }: { reward: RewardView; onPick: (status: string) => void }) {
  const options = reward.kind === "item" ? ITEM_STATUSES : POINTER_STATUSES;
  const tone = (status: string) =>
    reward.status !== status
      ? "text-muted hover:text-text"
      : status === "given" || status === "earned"
        ? "bg-ok/15 text-ok"
        : status === "skipped" || status === "lost"
          ? "bg-danger/15 text-danger"
          : "bg-surface-3 text-text";
  return (
    <div role="radiogroup" aria-label="Status" className="flex gap-1 rounded-xl border border-border bg-bg/40 p-1">
      {options.map((status) => (
        <button
          key={status}
          type="button"
          role="radio"
          aria-checked={reward.status === status}
          onClick={() => reward.status !== status && onPick(status)}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${tone(status)}`}
        >
          {STATUS_LABEL[status]}
        </button>
      ))}
    </div>
  );
}

export function RewardsPanel({
  detail,
  campaign,
  busy,
  onReplace,
  onStatus,
}: {
  detail: AreaDetail;
  campaign: string | null;
  busy: boolean;
  onReplace: (rewards: RewardInput[]) => Promise<boolean>;
  onStatus: (reward: RewardView, status: string) => void;
}) {
  const [form, setForm] = useState<{ kind: "item" | "pointer"; editing?: RewardView } | null>(null);
  const { rewards, battles } = detail;
  const battleName = (id: string | null) => (id === null ? "Whole area" : (battles.find((battle) => battle.id === id)?.name ?? "Missing battle"));
  const full = rewards.length >= MAX_REWARDS;

  const move = (index: number, by: -1 | 1) => {
    const next = toInputs(rewards);
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    void onReplace(next);
  };

  return (
    <section className="space-y-3" aria-label="Rewards">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-semibold">Rewards</h2>
        <div className="flex gap-2">
          <Button size="sm" icon={Plus} disabled={full || busy} onClick={() => setForm({ kind: "item" })}>
            Item
          </Button>
          <Button size="sm" icon={Plus} disabled={full || busy} onClick={() => setForm({ kind: "pointer" })}>
            Pointer
          </Button>
        </div>
      </div>

      {form ? (
        <RewardForm
          key={form.editing?.id ?? form.kind}
          kind={form.kind}
          initial={form.editing}
          battles={battles}
          campaign={campaign}
          onCancel={() => setForm(null)}
          onSubmit={async (reward) => {
            const next = toInputs(rewards);
            if (form.editing) next[rewards.findIndex((entry) => entry.id === form.editing?.id)] = reward;
            else next.push(reward);
            if (await onReplace(next)) setForm(null);
          }}
        />
      ) : null}

      {rewards.length === 0 && !form ? (
        <div className="rounded-3xl border border-dashed border-border py-4">
          <EmptyState icon={Gem} title="No rewards yet">
            Add the items the party can find here, and pointers: what follows in the story if they save someone or make a friend.
          </EmptyState>
        </div>
      ) : null}

      <ul className="space-y-2">
        {rewards.map((reward, index) => (
          <li key={reward.id} className="flex flex-wrap items-start gap-3 rounded-3xl border border-border bg-surface p-4 shadow-card">
            <span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${reward.kind === "item" ? "bg-accent-soft text-accent" : "bg-ok/10 text-ok"}`}>
              {reward.kind === "item" ? <Gem className="size-5" aria-hidden /> : <HeartHandshake className="size-5" aria-hidden />}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              {reward.kind === "item" ? (
                <>
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {reward.quantity > 1 ? <span className="tabular-nums">{reward.quantity} ×</span> : null}
                    {reward.resolved ? reward.resolved.name : <span className="text-warn">Missing item</span>}
                    {reward.resolved?.rarity ? <RarityBadge rarity={reward.resolved.rarity} /> : null}
                  </p>
                  {reward.note ? <p className="text-sm text-muted">{reward.note}</p> : null}
                </>
              ) : (
                <>
                  <p className="font-medium">{reward.title}</p>
                  {reward.condition ? (
                    <p className="text-sm text-muted">
                      <span className="text-faint">If</span> {reward.condition}
                    </p>
                  ) : null}
                  {reward.outcome ? (
                    <p className="text-sm text-muted">
                      <span className="text-faint">Then</span> {reward.outcome}
                    </p>
                  ) : null}
                  {reward.npcRef ? (
                    <p className="text-xs text-muted">NPC: {reward.resolved ? reward.resolved.name : <span className="text-warn">missing creature</span>}</p>
                  ) : null}
                </>
              )}
              <p className="pt-0.5">
                <Badge>{battleName(reward.encounterId)}</Badge>
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusButtons reward={reward} onPick={(status) => onStatus(reward, status)} />
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="size-8" icon={ArrowUp} aria-label="Move up" disabled={index === 0 || busy} onClick={() => move(index, -1)} />
                <Button size="icon" variant="ghost" className="size-8" icon={ArrowDown} aria-label="Move down" disabled={index === rewards.length - 1 || busy} onClick={() => move(index, 1)} />
                <Button size="icon" variant="ghost" className="size-8" icon={Pencil} aria-label="Edit reward" disabled={busy} onClick={() => setForm({ kind: reward.kind, editing: reward })} />
                <Button
                  size="icon"
                  variant="danger-ghost"
                  className="size-8"
                  icon={Trash2}
                  aria-label="Delete reward"
                  disabled={busy}
                  onClick={() => void onReplace(toInputs(rewards).filter((_, position) => position !== index))}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
