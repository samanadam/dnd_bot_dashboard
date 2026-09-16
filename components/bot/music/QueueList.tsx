"use client";

import { ArrowDown, ArrowUp, ListMusic, Trash2, X } from "lucide-react";
import { useState } from "react";
import { bot } from "@/lib/bot/client";
import type { PlayerState } from "@/lib/bot/types";
import { formatDuration } from "@/lib/format";
import { useMusicMutation } from "@/lib/bot/useBotState";
import { ConfirmDialog } from "../../ConfirmDialog";
import { Badge, Button, Card, EmptyState } from "../../ui";

function moved<T>(list: T[], from: number, to: number) {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function QueueList({ state, enabled }: { state: PlayerState; enabled: boolean }) {
  const [confirmClear, setConfirmClear] = useState(false);
  const remove = useMusicMutation(
    (index: number) => bot.removeFromQueue(index),
    (s, index) => ({ ...s, queue: s.queue.filter((_, i) => i !== index) }),
  );
  const move = useMusicMutation(
    ({ from, to }: { from: number; to: number }) => bot.moveInQueue(from, to),
    (s, { from, to }) => ({ ...s, queue: moved(s.queue, from, to) }),
  );
  const clear = useMusicMutation(() => bot.clearQueue(), (s) => ({ ...s, queue: [] }));
  const busy = remove.isPending || move.isPending || clear.isPending;
  const total = state.queue.reduce((sum, track) => sum + (track.duration_seconds ?? 0), 0);

  return (
    <Card
      title="Up next"
      subtitle={state.queue.length ? `${state.queue.length} tracks · ${formatDuration(total)}` : "Nothing queued"}
      icon={ListMusic}
      padded={false}
      className="self-start"
      action={
        state.queue.length > 0 && (
          <Button size="sm" variant="danger-ghost" icon={Trash2} disabled={!enabled || busy} onClick={() => setConfirmClear(true)}>
            Clear
          </Button>
        )
      }
    >
      {state.queue.length === 0 ? (
        <EmptyState icon={ListMusic} title="Queue is empty">
          Tracks you play while something is already on land here.
        </EmptyState>
      ) : (
        <ol className="divide-y divide-border">
          {state.queue.map((track, index) => (
            <li key={`${track.source}:${track.id}:${index}`} className="group flex items-center gap-3 px-5 py-3">
              <span className="w-5 text-right font-mono text-xs text-faint">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium" title={track.title}>
                  {track.title}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                  <Badge>{track.source === "r2" ? "Library" : "YouTube"}</Badge>
                  <span className="font-mono">{formatDuration(track.duration_seconds)}</span>
                </div>
              </div>
              <div className="flex shrink-0 gap-0.5 opacity-100 transition sm:opacity-60 sm:group-hover:opacity-100">
                <Button size="icon" variant="ghost" aria-label={`Move ${track.title} up`} disabled={!enabled || busy || index === 0} onClick={() => move.mutate({ from: index, to: index - 1 })}>
                  <ArrowUp className="size-4" aria-hidden />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Move ${track.title} down`}
                  disabled={!enabled || busy || index === state.queue.length - 1}
                  onClick={() => move.mutate({ from: index, to: index + 1 })}
                >
                  <ArrowDown className="size-4" aria-hidden />
                </Button>
                <Button size="icon" variant="danger-ghost" aria-label={`Remove ${track.title}`} disabled={!enabled || busy} onClick={() => remove.mutate(index)}>
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Clear the queue?"
        confirmLabel="Clear queue"
        busy={clear.isPending}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => clear.mutate(undefined, { onSettled: () => setConfirmClear(false) })}
      >
        <p>
          Removes {state.queue.length} track{state.queue.length === 1 ? "" : "s"}. The current track keeps playing.
        </p>
      </ConfirmDialog>
    </Card>
  );
}
