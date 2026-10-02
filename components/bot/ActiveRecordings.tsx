"use client";

import { AlertTriangle, CircleStop, Mic, Scissors, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { bot, BotError } from "@/lib/bot/client";
import type { ActiveSession } from "@/lib/bot/types";
import { formatDuration } from "@/lib/format";
import { useActiveRecordings, useBotOnline, useRecordingMutation } from "@/lib/bot/useBotState";
import { ConfirmDialog } from "../ConfirmDialog";
import { useToast } from "../Providers";
import { Badge, Button, Card, EmptyState, Skeleton } from "../ui";

type Pending = { kind: "stop" | "split" | "cancel"; session: ActiveSession } | null;

// Past this a stop takes minutes to encode, so a split is worth suggesting.
const LONG_SESSION_SECONDS = 3 * 3600;

export function ActiveRecordings() {
  const { online } = useBotOnline();
  const recordings = useActiveRecordings();
  const toast = useToast();
  const [pending, setPending] = useState<Pending>(null);

  const stop = useRecordingMutation(bot.stopRecording);
  const split = useRecordingMutation(bot.splitRecording);
  const cancel = useRecordingMutation(bot.cancelRecording);

  const confirm = () => {
    if (!pending) return;
    const { kind, session } = pending;
    const label = session.name ?? `#${session.channel_name}`;
    if (kind === "split") {
      if (split.isPending) return;
      split.mutate(session.channel_id, {
        onSuccess: (result) => {
          setPending(null);
          toast("ok", `Split into "${result.previous.name}" and "${result.session.name ?? "Untitled session"}".`);
        },
        // The failures below arrive with the bot's own message through the global
        // error toast; these add what it does not say.
        onError: (error) => {
          if (!(error instanceof BotError)) return;
          if (error.status === 409) {
            setPending(null);
            toast("danger", `${label} is still recording. Nothing was split.`);
          } else if (error.status === 404) {
            setPending(null);
            toast("danger", `Nothing was recording in #${session.channel_name}. The list has been refreshed.`);
          }
        },
      });
    } else if (kind === "stop") {
      stop.mutate(session.channel_id, {
        onSuccess: (result) => {
          setPending(null);
          toast("ok", `Stopped ${label} after ${formatDuration(result.duration_seconds)}${result.enqueued ? ", queued for transcription" : ""}.`);
          result.warnings.forEach((warning) => toast("danger", warning));
        },
        onError: (error) => {
          if (error instanceof BotError && error.code === "upstream_timeout") {
            setPending(null);
            toast("ok", `${label} is still being saved. It appears under sessions once the bot finishes.`);
          }
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
                {session.elapsed_seconds >= LONG_SESSION_SECONDS && (
                  <p className="mt-3 text-xs text-muted">Running for 3+ hours — splitting keeps stops short.</p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="primary" icon={CircleStop} disabled={!online} onClick={() => setPending({ kind: "stop", session })}>
                    Stop &amp; save
                  </Button>
                  <Button icon={Scissors} disabled={!online} onClick={() => setPending({ kind: "split", session })}>
                    Split
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
        open={pending?.kind === "split"}
        title="Split this recording?"
        confirmLabel="Split"
        tone="primary"
        busy={split.isPending}
        onConfirm={confirm}
        onClose={() => !split.isPending && setPending(null)}
      >
        {pending && <SessionLine session={pending.session} />}
        <p>
          This saves the game so far and carries on as the next part in the same channel, with no gap. Nobody needs to
          rejoin.
        </p>
        <p>The first part is saved in the background and its transcript arrives separately.</p>
        <p>A sentence spoken at the moment of the split is cut in two, so pick a pause.</p>
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
