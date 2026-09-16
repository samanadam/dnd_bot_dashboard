"use client";

import { AlertTriangle, CircleStop, Mic, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { bot } from "@/lib/bot/client";
import type { ActiveSession } from "@/lib/bot/types";
import { formatDuration } from "@/lib/format";
import { useActiveRecordings, useBotOnline, useRecordingMutation } from "@/lib/bot/useBotState";
import { ConfirmDialog } from "../ConfirmDialog";
import { useToast } from "../Providers";
import { Badge, Button, Card, EmptyState, Skeleton } from "../ui";

type Pending = { kind: "stop" | "cancel"; session: ActiveSession } | null;

export function ActiveRecordings() {
  const { online } = useBotOnline();
  const recordings = useActiveRecordings();
  const toast = useToast();
  const [pending, setPending] = useState<Pending>(null);

  const stop = useRecordingMutation(bot.stopRecording);
  const cancel = useRecordingMutation(bot.cancelRecording);

  const confirm = () => {
    if (!pending) return;
    const { kind, session } = pending;
    const label = session.name ?? `#${session.channel_name}`;
    if (kind === "stop") {
      stop.mutate(session.channel_id, {
        onSuccess: (result) => {
          setPending(null);
          toast("ok", `Stopped ${label} after ${formatDuration(result.duration_seconds)}${result.enqueued ? ", queued for transcription" : ""}.`);
          result.warnings.forEach((warning) => toast("danger", warning));
        },
      });
    } else {
      cancel.mutate(session.channel_id, {
        onSuccess: () => {
          setPending(null);
          toast("ok", `Cancelled ${label}. Audio deleted.`);
        },
      });
    }
  };

  const count = recordings.data?.length ?? 0;

  return (
    <div id="recording-now" className="scroll-mt-24">
      <Card
        title="Recording now"
        subtitle={count ? `${count} live` : "Live sessions appear here"}
        icon={Mic}
        action={count ? <Badge tone="danger" dot>Live</Badge> : undefined}
      >
        {recordings.isPending ? (
          <Skeleton className="h-28" />
        ) : recordings.isError ? (
          <EmptyState icon={Mic} title="Unavailable">Shown again once the bot answers.</EmptyState>
        ) : count ? (
          <ul className="space-y-3">
            {recordings.data.map((session) => (
              <li key={session.session_id} className="rounded-2xl border border-danger/25 bg-danger/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold">{session.name ?? "Untitled session"}</div>
                    <div className="mt-0.5 text-xs text-muted">
                      #{session.channel_name} · {session.speaker_count} speaker{session.speaker_count === 1 ? "" : "s"}
                    </div>
                  </div>
                  <span className="font-mono text-3xl font-semibold tabular-nums">
                    <Elapsed base={session.elapsed_seconds} updatedAt={recordings.dataUpdatedAt} />
                  </span>
                </div>
                {session.speakers.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {session.speakers.map((speaker) => (
                      <span key={speaker} className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs">
                        {speaker}
                      </span>
                    ))}
                  </div>
                )}
                {session.warnings.map((warning) => (
                  <p key={warning} className="mt-3 flex items-start gap-2 text-xs text-warn">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {warning}
                  </p>
                ))}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="primary" icon={CircleStop} disabled={!online} onClick={() => setPending({ kind: "stop", session })}>
                    Stop &amp; save
                  </Button>
                  <Button variant="danger-ghost" icon={Trash2} disabled={!online} onClick={() => setPending({ kind: "cancel", session })}>
                    Cancel…
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Mic} title="Nothing is recording">
            Start from the panel, from Discord with /record, or use &ldquo;Record this channel&rdquo; when the bot is in voice.
          </EmptyState>
        )}
      </Card>

      <ConfirmDialog
        open={pending?.kind === "stop"}
        title="Stop recording?"
        confirmLabel="Stop & save"
        tone="primary"
        busy={stop.isPending}
        onConfirm={confirm}
        onClose={() => !stop.isPending && setPending(null)}
      >
        {pending && <SessionLine session={pending.session} />}
        <p>The audio is kept and queued for transcription.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={pending?.kind === "cancel"}
        title="Cancel and delete this recording?"
        confirmLabel="Delete recording"
        requireText="delete"
        busy={cancel.isPending}
        onConfirm={confirm}
        onClose={() => !cancel.isPending && setPending(null)}
      >
        {pending && <SessionLine session={pending.session} />}
        <p className="font-semibold text-danger">This deletes the audio. It cannot be undone.</p>
      </ConfirmDialog>
    </div>
  );
}

function SessionLine({ session }: { session: ActiveSession }) {
  return (
    <p>
      <span className="font-medium text-text">{session.name ?? "Untitled session"}</span> in #{session.channel_name}, running for{" "}
      <span className="font-mono">{formatDuration(session.elapsed_seconds)}</span>.
    </p>
  );
}

// Ticks locally between polls so the clock does not jump.
function Elapsed({ base, updatedAt }: { base: number; updatedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const drift = updatedAt ? Math.max(0, (now - updatedAt) / 1000) : 0;
  return <>{formatDuration(base + drift)}</>;
}
