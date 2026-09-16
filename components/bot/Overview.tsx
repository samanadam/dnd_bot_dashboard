"use client";

import { ArrowRight, BarChart3, Cloud, FileText, HardDrive, History, Server } from "lucide-react";
import Link from "next/link";
import { formatBytes, formatUptime } from "@/lib/format";
import type { Stats } from "@/lib/bot/types";
import { useHealth, useSessions, useStats } from "@/lib/bot/useBotState";
import { Card, PageHeader, Skeleton, StatCard } from "../ui";
import { ActiveRecordings } from "./ActiveRecordings";
import { LivePresence } from "./LivePresence";
import { SessionChart } from "./SessionChart";
import { SessionList } from "./SessionTable";
import { StartRecording } from "./StartRecording";

export function Overview() {
  const health = useHealth();
  const stats = useStats();
  const sessions = useSessions(25);
  const s = stats.data;
  const loading = health.isPending && stats.isPending;

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" description="Live state of the recorder bot. Everything here updates on its own." />

      <LivePresence />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32" />)
        ) : (
          <>
            <StatCard
              label="Bot"
              icon={Server}
              value={health.isError ? "Offline" : health.data?.ready ? "Online" : "Starting"}
              tone={health.isError ? "danger" : health.data?.ready ? "ok" : "warn"}
              hint={[s?.version && `v${s.version}`, health.data && `up ${formatUptime(health.data.uptime_seconds)}`].filter(Boolean).join(" · ") || undefined}
            />
            <StatCard
              label="Pending transcripts"
              icon={FileText}
              value={s ? s.sessions.pending_transcription : "—"}
              tone={s && s.sessions.pending_transcription > 0 ? "warn" : undefined}
              hint={s ? (s.sessions.pending_transcription ? "Waiting in the queue" : "Queue is clear") : undefined}
            />
            <StatCard
              label="Disk free"
              icon={HardDrive}
              value={s ? formatBytes(freeBytes(s)) : "—"}
              tone={s?.disk.low_disk ? "danger" : undefined}
              meter={s ? s.disk.data_bytes / (s.disk.data_bytes + freeBytes(s)) : undefined}
              hint={s ? `${s.disk.low_disk ? "Low disk. " : ""}Recordings use ${formatBytes(s.disk.data_bytes)}` : undefined}
            />
            <StatCard
              label="Storage"
              icon={Cloud}
              value={s ? storageLabel(s.storage) : "—"}
              tone={s ? storageTone(s.storage) : undefined}
              hint={s ? `Backend: ${s.storage.backend}` : undefined}
            />
          </>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <ActiveRecordings />
        <StartRecording />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Session length" subtitle="Last 12 finished sessions" icon={BarChart3}>
          {sessions.isPending ? (
            <Skeleton className="h-40" />
          ) : sessions.isError ? (
            <p className="py-10 text-center text-sm text-muted">Unavailable while the bot is unreachable.</p>
          ) : (
            <SessionChart sessions={sessions.data} />
          )}
        </Card>
        <Card
          title="Recent sessions"
          icon={History}
          padded={false}
          action={
            <Link href="/bot/sessions" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
              View all <ArrowRight className="size-3" aria-hidden />
            </Link>
          }
        >
          <SessionList query={sessions} limit={5} />
        </Card>
      </div>
    </div>
  );
}

// The bot reports disk in decimal megabytes (bytes / 1_000_000), so converting
// with 1024 * 1024 overstated free space by about 5% and skewed the meter.
function freeBytes(stats: Stats): number {
  return stats.disk.free_mb * 1_000_000;
}

// `reachable` is tri-state. null means there is nothing to reach (local disk)
// or the bot has not probed the bucket yet - neither of which is an outage, so
// neither may be shown as "Down".
function storageLabel(storage: Stats["storage"]): string {
  if (storage.reachable === true) return "Reachable";
  if (storage.reachable === false) return "Down";
  return storage.backend === "local" ? "Local disk" : "Checking";
}

function storageTone(storage: Stats["storage"]): "ok" | "danger" | undefined {
  if (storage.reachable === true) return "ok";
  if (storage.reachable === false) return "danger";
  return undefined;
}
