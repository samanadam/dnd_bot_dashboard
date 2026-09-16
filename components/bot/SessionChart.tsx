"use client";

import { useState } from "react";
import type { SessionSummary } from "@/lib/bot/types";
import { formatDateTime, formatDuration } from "@/lib/format";

/**
 * Length of recent sessions, oldest to newest. One series, so the card title
 * names it and there is no legend; the session table is the table view.
 */
export function SessionChart({ sessions, height = 160 }: { sessions: SessionSummary[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const points = sessions
    .filter((session) => session.duration_seconds && !session.cancelled)
    .slice(0, 12)
    .reverse();

  if (points.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">No finished sessions yet.</p>;
  }

  const maxSeconds = Math.max(...points.map((p) => p.duration_seconds ?? 0));
  // Round the axis up to whole hours (or 15 minutes for short sessions).
  const step = maxSeconds > 3600 ? 3600 : 900;
  const axisMax = Math.max(step, Math.ceil(maxSeconds / step) * step);
  const ticks = [0, axisMax / 2, axisMax];
  const totalHours = points.reduce((sum, p) => sum + (p.duration_seconds ?? 0), 0) / 3600;
  const active = hover !== null ? points[hover] : null;

  return (
    <figure className="relative" aria-label={`Session lengths for the last ${points.length} sessions, ${totalHours.toFixed(1)} hours in total`}>
      <div className="flex gap-3">
        {/* Y axis */}
        <div className="flex flex-col justify-between pb-6 text-right font-mono text-[10px] text-muted" style={{ height }}>
          {[...ticks].reverse().map((tick) => (
            <span key={tick}>{tick >= 3600 ? `${tick / 3600}h` : `${Math.round(tick / 60)}m`}</span>
          ))}
        </div>
        <div className="relative flex-1">
          {/* Recessive grid */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height: height - 24 }} aria-hidden>
            {ticks.map((tick) => (
              <div key={tick} className="border-t border-dashed border-border" />
            ))}
          </div>
          <div className="relative flex items-end gap-[2px]" style={{ height: height - 24 }} onMouseLeave={() => setHover(null)}>
            {points.map((point, index) => {
              const pct = ((point.duration_seconds ?? 0) / axisMax) * 100;
              const dimmed = hover !== null && hover !== index;
              return (
                <button
                  key={point.id}
                  type="button"
                  className="group relative flex h-full flex-1 items-end justify-center focus:outline-none"
                  onMouseEnter={() => setHover(index)}
                  onFocus={() => setHover(index)}
                  onBlur={() => setHover(null)}
                  aria-label={`${point.name ?? "Untitled"}, ${formatDateTime(point.started_at)}, ${formatDuration(point.duration_seconds)}`}
                >
                  <span
                    className={`w-full max-w-10 rounded-t-[4px] bg-accent transition-opacity ${dimmed ? "opacity-35" : "opacity-100"} group-focus-visible:ring-2 group-focus-visible:ring-text`}
                    style={{ height: `${Math.max(pct, 2)}%` }}
                  />
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10px] text-muted">
            <span>{formatDateTime(points[0].started_at)}</span>
            {points.length > 1 && <span>{formatDateTime(points[points.length - 1].started_at)}</span>}
          </div>
          {active && hover !== null && (
            <div
              role="status"
              className="pointer-events-none absolute -top-2 z-10 w-48 -translate-x-1/2 -translate-y-full rounded-xl border border-border bg-surface-3 px-3 py-2 text-xs shadow-card"
              style={{ left: `${((hover + 0.5) / points.length) * 100}%` }}
            >
              <div className="truncate font-medium text-text">{active.name ?? "Untitled"}</div>
              <div className="text-muted">{formatDateTime(active.started_at)}</div>
              <div className="mt-1 font-mono text-text">{formatDuration(active.duration_seconds)}</div>
            </div>
          )}
        </div>
      </div>
    </figure>
  );
}
