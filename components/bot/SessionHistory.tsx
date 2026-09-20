"use client";

import { AlertTriangle, BarChart3, Clock, FileText, History } from "lucide-react";
import { useState } from "react";
import { useSessions, useStats } from "@/lib/bot/useBotState";
import { useCampaignSelection } from "@/lib/campaign/useSelection";
import { CampaignSwitcher } from "../CampaignSelect";
import { Card, PageHeader, Skeleton, StatCard } from "../ui";
import { SessionChart } from "./SessionChart";
import { SessionTable } from "./SessionTable";
import { TranscriptionQueue } from "./TranscriptionQueue";
import { TrashCard } from "./TrashCard";

const LIMITS = [25, 50, 100, 200];

export function SessionHistory({ canManage = false }: { canManage?: boolean }) {
  const [limit, setLimit] = useState(25);
  const [campaign] = useCampaignSelection();
  const sessions = useSessions(limit, campaign);
  const stats = useStats();

  const list = sessions.data ?? [];
  const totalSeconds = list.reduce((sum, session) => sum + (session.duration_seconds ?? 0), 0);
  const interrupted = list.filter((session) => !session.ended_at && !session.cancelled).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sessions"
        description="Every recording the bot has made, and what happened to it."
        action={<CampaignSwitcher />}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Sessions shown" icon={History} value={sessions.data ? list.length : "—"} />
        <StatCard label="Hours recorded" icon={Clock} value={sessions.data ? (totalSeconds / 3600).toFixed(1) : "—"} hint={`In the last ${limit}`} />
        <StatCard
          label="Pending transcripts"
          icon={FileText}
          value={stats.data ? stats.data.sessions.pending_transcription : "—"}
          tone={stats.data && stats.data.sessions.pending_transcription > 0 ? "warn" : undefined}
        />
        <StatCard
          label="Unfinished"
          icon={AlertTriangle}
          value={sessions.data ? interrupted : "—"}
          tone={interrupted > 0 ? "warn" : undefined}
          hint="Interrupted, or live right now"
        />
      </div>

      <TranscriptionQueue canManage={canManage} />

      <Card title="Session length" subtitle="Last 12 finished sessions" icon={BarChart3}>
        {sessions.isPending ? <Skeleton className="h-40" /> : <SessionChart sessions={list} />}
      </Card>

      <Card
        title="History"
        icon={History}
        padded={false}
        action={
          <label className="flex items-center gap-2 text-xs text-muted">
            Show
            <select
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              className="h-8 rounded-lg border border-border bg-surface-2 px-2 text-sm text-text focus:border-accent focus:outline-none"
            >
              {LIMITS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        }
      >
        <SessionTable query={sessions} canManage={canManage} />
      </Card>

      {canManage ? <TrashCard /> : null}
    </div>
  );
}
