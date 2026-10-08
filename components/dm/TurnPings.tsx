"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { useToast } from "@/components/Providers";
import { Notice, inputBaseClass } from "@/components/ui";
import { DmError } from "@/lib/dm/client";
import { combat } from "@/lib/sheets/client";

/** A campaign's Discord turn pings: when a player's turn starts in a shown battle, the bot mentions them. */
export function TurnPings({ campaignId }: { campaignId: string }) {
  const toast = useToast();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["turn-pings", campaignId], queryFn: () => combat.settings(campaignId) });
  if (!query.data) return null;
  const { settings, channels } = query.data;
  const save = async (enabled: boolean, channelId: string | null) => {
    try {
      await combat.saveSettings(campaignId, { turnPing: { enabled, channelId } });
      await client.invalidateQueries({ queryKey: ["turn-pings", campaignId] });
      toast("ok", enabled ? "Turn pings are on." : "Turn pings are off.");
    } catch (error) {
      toast("danger", error instanceof DmError ? error.message : "Could not save.");
    }
  };
  return (
    <section className="space-y-3 rounded-3xl border border-border bg-surface p-4 shadow-card">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <BellRing className="size-4 text-accent" aria-hidden /> Discord turn pings
      </h2>
      <p className="text-xs text-muted">When a player&apos;s turn starts in a battle shown to players, the bot mentions them in this channel.</p>
      {channels === null ? <Notice tone="warn">The bot did not answer, so the channel list is unavailable.</Notice> : null}
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Channel"
          className={`${inputBaseClass} h-10 min-w-48`}
          value={settings.turnPing.channelId ?? ""}
          disabled={!channels}
          onChange={(event) => void save(settings.turnPing.enabled && Boolean(event.target.value), event.target.value || null)}
        >
          <option value="">Pick a channel…</option>
          {(channels ?? []).map((channel) => (
            <option key={channel.id} value={channel.id}>
              #{channel.name}
              {channel.category ? ` (${channel.category})` : ""}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-[var(--accent)]"
            checked={settings.turnPing.enabled}
            disabled={!settings.turnPing.channelId}
            onChange={(event) => void save(event.target.checked, settings.turnPing.channelId)}
          />
          Ping players on their turn
        </label>
      </div>
    </section>
  );
}
