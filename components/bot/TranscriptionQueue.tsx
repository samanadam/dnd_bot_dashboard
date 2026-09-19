"use client";

import { CloudUpload, Hourglass, RefreshCw } from "lucide-react";
import Link from "next/link";
import { BotError } from "@/lib/bot/client";
import type { QueueItem } from "@/lib/bot/types";
import { useBotOnline, useSyncTranscription, useTranscriptionQueue } from "@/lib/bot/useBotState";
import { formatDuration } from "@/lib/format";
import { useToast } from "../Providers";
import { Badge, Button, Card } from "../ui";

const LABEL: Record<QueueItem["status"], string> = {
  uploading: "Uploading",
  waiting: "With the transcriber",
  transcribing: "Transcribing",
};

/**
 * Sessions recorded but not transcribed yet. The bot can see where the audio
 * is, not what the transcriber is doing, so a long wait is flagged rather than
 * called a failure.
 */
export function TranscriptionQueue({ canManage }: { canManage: boolean }) {
  const queue = useTranscriptionQueue();
  const sync = useSyncTranscription();
  const { online } = useBotOnline();
  const toast = useToast();
  const items = queue.data?.items ?? [];
  if (queue.isPending || queue.isError || items.length === 0) return null;

  return (
    <Card
      title="Waiting for transcripts"
      subtitle={`${items.length} session${items.length === 1 ? "" : "s"} recorded, not transcribed yet`}
      icon={Hourglass}
      padded={false}
      action={
        canManage && queue.data?.can_sync ? (
          <Button
            size="sm"
            icon={RefreshCw}
            busy={sync.isPending}
            disabled={!online}
            onClick={() =>
              sync.mutate(undefined, {
                onSuccess: (result) => toast("ok", `Sent ${result.uploaded}, brought back ${result.fetched}.`),
                onError: (error) => toast("danger", error instanceof BotError ? error.message : "Could not sync."),
              })
            }
          >
            Sync now
          </Button>
        ) : undefined
      }
    >
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.session_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
            <div className="min-w-0 flex-1">
              <Link href={`/bot/sessions/${encodeURIComponent(item.session_id)}`} className="block truncate text-sm font-medium hover:text-accent">
                {item.name ?? "Untitled session"}
              </Link>
              <div className="text-xs text-muted">
                {item.campaign_name ?? "Not in a campaign"}
                {item.waiting_seconds !== null ? ` · waiting ${formatDuration(item.waiting_seconds)}` : ""}
              </div>
            </div>
            {item.stalled ? <Badge tone="warn">Waiting a long time</Badge> : null}
            <Badge tone={item.status === "uploading" ? "accent" : "neutral"} dot>
              {item.status === "uploading" ? <CloudUpload className="mr-1 inline size-3" aria-hidden /> : null}
              {LABEL[item.status]}
            </Badge>
          </li>
        ))}
      </ul>
      {items.some((item) => item.stalled) ? (
        <p className="border-t border-border px-5 py-3 text-xs text-muted">
          The transcriber runs on its own schedule and may be switched off. Nothing is lost: the audio is kept until the transcript comes back.
        </p>
      ) : null}
    </Card>
  );
}
