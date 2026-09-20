"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { bot, BotError } from "@/lib/bot/client";
import type { TrashedSession } from "@/lib/bot/types";
import { useSessionMutation, useTrash } from "@/lib/bot/useBotState";
import { formatDateTime } from "@/lib/format";
import { ConfirmDialog } from "../ConfirmDialog";
import { useToast } from "../Providers";
import { Button, Card } from "../ui";

/** Whole days until a trashed session is removed for good, never below zero. */
export function daysLeft(purgeAt: string | null, now = Date.now()): number | null {
  if (!purgeAt) return null;
  const due = Date.parse(purgeAt);
  if (Number.isNaN(due)) return null;
  return Math.max(0, Math.ceil((due - now) / 86_400_000));
}

function remaining(purgeAt: string | null): string {
  const days = daysLeft(purgeAt);
  if (days === null) return "";
  if (days === 0) return "Removed soon";
  return days === 1 ? "1 day left" : `${days} days left`;
}

/**
 * Sessions the DM deleted. They can be put back until their time runs out, or
 * removed for good right away; that last step asks for a typed confirmation.
 */
export function TrashCard() {
  const toast = useToast();
  const trash = useTrash(true);
  const [purging, setPurging] = useState<TrashedSession | null>(null);
  const restore = useSessionMutation((id: string) => bot.restoreSession(id));
  const purge = useSessionMutation((id: string) => bot.purgeSession(id));
  const items = trash.data ?? [];
  if (trash.isPending || trash.isError || items.length === 0) return null;

  const failure = (error: unknown, fallback: string) => toast("danger", error instanceof BotError ? error.message : fallback);

  return (
    <>
      <Card title="Trash" subtitle={`${items.length} deleted session${items.length === 1 ? "" : "s"}, restorable until they expire`} icon={Trash2} padded={false}>
        <ul className="divide-y divide-border">
          {items.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{session.name ?? "Untitled session"}</div>
                <div className="text-xs text-muted">
                  Recorded {formatDateTime(session.started_at)}
                  {session.campaign_name ? ` · ${session.campaign_name}` : ""}
                  {remaining(session.purge_at) ? ` · ${remaining(session.purge_at)}` : ""}
                </div>
              </div>
              <Button
                size="sm"
                icon={RotateCcw}
                disabled={restore.isPending || purge.isPending}
                onClick={() =>
                  restore.mutate(session.id, {
                    onSuccess: () => toast("ok", "Restored."),
                    onError: (error) => failure(error, "Could not restore that session."),
                  })
                }
              >
                Restore
              </Button>
              <Button size="sm" variant="danger" icon={Trash2} disabled={restore.isPending || purge.isPending} onClick={() => setPurging(session)}>
                Delete forever
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      <ConfirmDialog
        open={purging !== null}
        title="Delete this session forever?"
        confirmLabel="Delete forever"
        requireText="delete"
        busy={purge.isPending}
        onClose={() => !purge.isPending && setPurging(null)}
        onConfirm={() => {
          if (!purging) return;
          purge.mutate(purging.id, {
            onSuccess: () => {
              setPurging(null);
              toast("ok", "Session deleted for good.");
            },
            onError: (error) => failure(error, "Could not delete that session."),
          });
        }}
      >
        {purging && (
          <>
            <p>
              <span className="font-medium text-text">{purging.name ?? "Untitled session"}</span>, recorded {formatDateTime(purging.started_at)}.
            </p>
            <p>Its audio, transcript, search entries and any copy waiting for the transcriber are removed. This cannot be undone.</p>
          </>
        )}
      </ConfirmDialog>
    </>
  );
}
