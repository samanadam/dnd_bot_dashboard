"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { History, LifeBuoy, Users } from "lucide-react";
import { useState } from "react";
import { bot } from "@/lib/bot/client";
import type { SessionSummary } from "@/lib/bot/types";
import { formatDateTime, formatDuration } from "@/lib/format";
import { useActiveRecordings, useBotOnline, useRecordingMutation } from "@/lib/bot/useBotState";
import { ConfirmDialog } from "../ConfirmDialog";
import { useToast } from "../Providers";
import { Badge, Button, EmptyState, Skeleton } from "../ui";

type Status = { label: string; tone: "danger" | "neutral" | "warn" | "ok" | "accent"; recoverable: boolean };

function status(session: SessionSummary, activeIds: Set<string>): Status {
  if (activeIds.has(session.id)) return { label: "Recording", tone: "danger", recoverable: false };
  if (session.cancelled) return { label: "Cancelled", tone: "neutral", recoverable: false };
  // Never ended and not live: the bot lost it (crash, restart). Recoverable.
  if (!session.ended_at) return { label: "Interrupted", tone: "warn", recoverable: true };
  if (session.transcribed) return { label: "Transcribed", tone: "ok", recoverable: false };
  return { label: "Pending transcript", tone: "accent", recoverable: false };
}

function useSessionContext() {
  const { online } = useBotOnline();
  const active = useActiveRecordings();
  const toast = useToast();
  const [recovering, setRecovering] = useState<SessionSummary | null>(null);
  const recover = useRecordingMutation(bot.recoverRecording);
  const activeIds = new Set((active.data ?? []).map((session) => session.session_id));

  const dialog = (
    <ConfirmDialog
      open={recovering !== null}
      title="Recover interrupted session?"
      confirmLabel="Recover"
      tone="primary"
      busy={recover.isPending}
      onClose={() => !recover.isPending && setRecovering(null)}
      onConfirm={() => {
        if (!recovering) return;
        recover.mutate(recovering.id, {
          onSuccess: (result) => {
            setRecovering(null);
            toast("ok", `Recovered ${result.name}: ${formatDuration(result.duration_seconds)}${result.enqueued ? ", queued for transcription" : ""}.`);
            result.warnings.forEach((warning) => toast("danger", warning));
          },
        });
      }}
    >
      {recovering && (
        <p>
          <span className="font-medium text-text">{recovering.name ?? "Untitled"}</span>, started {formatDateTime(recovering.started_at)}. The bot will
          finalise whatever audio it has on disk.
        </p>
      )}
    </ConfirmDialog>
  );

  // Until the live list has loaded we cannot tell "interrupted" from "live".
  const recoverButton = (session: SessionSummary, s: Status) =>
    s.recoverable && active.isSuccess ? (
      <Button size="sm" icon={LifeBuoy} disabled={!online} onClick={() => setRecovering(session)}>
        Recover
      </Button>
    ) : null;

  return { activeIds, dialog, recoverButton };
}

function QueryState({ query }: { query: UseQueryResult<SessionSummary[]> }) {
  if (query.isPending)
    return (
      <div className="space-y-2 p-5">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  if (query.isError)
    return (
      <EmptyState icon={History} title="History unavailable">
        Shown again once the bot answers.
      </EmptyState>
    );
  return (
    <EmptyState icon={History} title="No sessions yet">
      Recordings show up here once they finish.
    </EmptyState>
  );
}

/** Compact row list. Used on the overview and on phones. */
export function SessionList({ query, limit }: { query: UseQueryResult<SessionSummary[]>; limit?: number }) {
  const { activeIds, dialog, recoverButton } = useSessionContext();
  if (!query.data?.length) return <QueryState query={query} />;
  const rows = limit ? query.data.slice(0, limit) : query.data;

  return (
    <>
      <ul className="divide-y divide-border">
        {rows.map((session) => {
          const s = status(session, activeIds);
          const date = new Date(session.started_at);
          return (
            <li key={session.id} className="flex items-center gap-3 px-5 py-3.5">
              <span className="flex size-10 shrink-0 flex-col items-center justify-center rounded-xl bg-surface-2 leading-none">
                <span className="text-sm font-semibold tabular-nums">{date.getDate()}</span>
                <span className="mt-0.5 text-[9px] uppercase text-muted">{date.toLocaleDateString(undefined, { month: "short" })}</span>
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{session.name ?? "Untitled session"}</div>
                <div className="flex flex-wrap items-center gap-x-2.5 text-xs text-muted">
                  <span className="font-mono">{formatDuration(session.duration_seconds)}</span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3" aria-hidden />
                    {session.speaker_count}
                  </span>
                  <span>#{session.channel_name}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <Badge tone={s.tone} dot>
                  {s.label}
                </Badge>
                {recoverButton(session, s)}
              </div>
            </li>
          );
        })}
      </ul>
      {dialog}
    </>
  );
}

/** Full table on wider screens, row list on phones. */
export function SessionTable({ query }: { query: UseQueryResult<SessionSummary[]> }) {
  const { activeIds, dialog, recoverButton } = useSessionContext();
  if (!query.data?.length) return <QueryState query={query} />;

  return (
    <>
      <div className="md:hidden">
        <SessionList query={query} />
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-faint">
            <tr className="border-b border-border">
              <th className="px-5 py-3 font-medium">Session</th>
              <th className="px-3 py-3 font-medium">Started</th>
              <th className="px-3 py-3 font-medium">Length</th>
              <th className="px-3 py-3 font-medium">Speakers</th>
              <th className="px-5 py-3 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {query.data.map((session) => {
              const s = status(session, activeIds);
              return (
                <tr key={session.id} className="transition hover:bg-surface-2/60">
                  <td className="px-5 py-3.5">
                    <div className="font-medium">{session.name ?? "Untitled session"}</div>
                    <div className="text-xs text-muted">#{session.channel_name}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-muted tabular-nums">{formatDateTime(session.started_at)}</td>
                  <td className="px-3 py-3.5 font-mono tabular-nums">{formatDuration(session.duration_seconds)}</td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums">{session.speaker_count}</span>
                      <span className="max-w-48 truncate text-xs text-muted">{session.speakers.join(", ")}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      {recoverButton(session, s)}
                      <Badge tone={s.tone} dot>
                        {s.label}
                      </Badge>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {dialog}
    </>
  );
}
