"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NotebookPen } from "lucide-react";
import { useToast } from "@/components/Providers";
import { Notice, inputBaseClass } from "@/components/ui";
import { DmError } from "@/lib/dm/client";
import { partyNotes } from "@/lib/sheets/client";

/** The Discord text channel a campaign's party notes mirror to, in both directions. */
export function PartyNotesChannel({ campaignId }: { campaignId: string }) {
  const toast = useToast();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["party-notes-channel", campaignId], queryFn: () => partyNotes.channel(campaignId) });
  if (!query.data) return null;
  const { channelId, channels } = query.data;
  const save = async (next: string | null) => {
    try {
      await partyNotes.setChannel(campaignId, next);
      await client.invalidateQueries({ queryKey: ["party-notes-channel", campaignId] });
      toast("ok", next ? "Party notes are synced with that channel." : "Party notes sync is off.");
    } catch (error) {
      toast("danger", error instanceof DmError ? error.message : "Could not save.");
    }
  };
  return (
    <section className="space-y-3 rounded-3xl border border-border bg-surface p-4 shadow-card">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <NotebookPen className="size-4 text-accent" aria-hidden /> Discord party notes
      </h2>
      <p className="text-xs text-muted">Anything said in this channel becomes a party note, and notes written in the portal are posted there. Edits and deletes go both ways.</p>
      {channels === null ? <Notice tone="warn">The bot did not answer, so the channel list is unavailable.</Notice> : null}
      <select aria-label="Notes channel" className={`${inputBaseClass} h-10 min-w-48`} value={channelId ?? ""} disabled={!channels} onChange={(event) => void save(event.target.value || null)}>
        <option value="">Not synced</option>
        {(channels ?? []).map((channel) => (
          <option key={channel.id} value={channel.id}>
            #{channel.name}
            {channel.category ? ` (${channel.category})` : ""}
          </option>
        ))}
      </select>
    </section>
  );
}
