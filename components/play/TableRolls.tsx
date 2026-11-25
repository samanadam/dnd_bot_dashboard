"use client";

import { useQuery } from "@tanstack/react-query";
import { Dices, EyeOff } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { tableRolls } from "@/lib/sheets/client";

const ago = (iso: string, now: number): string => {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

/**
 * The campaign's recent rolls, from the portal and from D&D Beyond. Players see the rolls to everyone
 * and their own; the DM also sees the DM-only ones (the server decides, see lib/play/tableRolls.ts).
 */
export function TableRolls({ campaignId, limit = 12 }: { campaignId: string; limit?: number }) {
  const feed = useQuery({ queryKey: ["table-rolls", campaignId], queryFn: () => tableRolls.list(campaignId), refetchInterval: 5000 });
  const rolls = (feed.data?.rolls ?? []).slice(0, limit);
  // "How long ago" is measured from the last refresh (every 5 s), not the clock during render.
  const now = feed.dataUpdatedAt;

  return (
    <Card title="Table rolls" subtitle="From the portal and D&D Beyond, newest first" icon={Dices}>
      {feed.isError ? <p className="text-sm text-muted">Could not load the rolls.</p> : null}
      {feed.data && rolls.length === 0 ? <p className="text-sm text-muted">No rolls yet.</p> : null}
      {rolls.length > 0 ? (
        <ol className="space-y-1.5" aria-live="polite">
          {rolls.map((roll) => (
            <li key={roll.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm">
              <span className="w-10 text-lg font-semibold tabular-nums">{roll.total}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{roll.who}</span> <span className="text-muted">{roll.label}</span>
                <span className="block truncate font-mono text-xs text-faint">
                  {roll.expression} · {roll.breakdown}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                {roll.visibility === "dm" ? (
                  <Badge tone="warn">
                    <EyeOff className="size-3" aria-hidden /> DM only
                  </Badge>
                ) : null}
                <Badge tone={roll.source === "ddb" ? "accent" : "neutral"}>{roll.source === "ddb" ? "D&D Beyond" : "Portal"}</Badge>
                <span className="text-xs text-faint">{ago(roll.at, now)}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </Card>
  );
}
