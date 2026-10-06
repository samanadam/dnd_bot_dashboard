"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Disc3, ListEnd, ListStart, Play, Save, Shuffle } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import { useToast } from "@/components/Providers";
import { Badge, Button, Notice, Skeleton } from "@/components/ui";
import { bot, BotError } from "@/lib/bot/client";
import type { QueuePosition, SetListing, SetPlayResult, Track } from "@/lib/bot/types";
import { useMusicMutation } from "@/lib/bot/useBotState";
import { formatDuration } from "@/lib/format";
import { useLocalValue } from "@/lib/useLocalValue";

// SoundCloud albums and playlists. The bot lists a set's tracks and queues it
// whole; every link here is the one plain set form (soundcloudSetUrl).

export const setKey = (link: string) => ["bot", "music", "set", link] as const;

/** The tracks of one set, fetched once and kept for a while: a set rarely changes mid-game. */
export function useSetListing(link: string, enabled = true) {
  return useQuery({
    queryKey: setKey(link),
    queryFn: () => bot.setTracks(link),
    enabled,
    staleTime: 10 * 60_000,
    retry: (count, error) => !(error instanceof BotError && !error.unreachable) && count < 1,
  });
}

/** Whether sets are queued shuffled, remembered per browser. */
export function useSetShuffle(): [boolean, (next: boolean) => void] {
  const [value, setValue] = useLocalValue("portal.music.setShuffle");
  return [value === "1", (next) => setValue(next ? "1" : "")];
}

/** Queue a whole set. `channel` joins that voice channel first when the bot is not in one. */
export function useSetPlay(channel?: string) {
  const toast = useToast();
  const mutation = useMusicMutation((input: { link: string; title: string; position: QueuePosition; shuffle: boolean }) =>
    bot.playSet({ id: input.link, position: input.position, shuffle: input.shuffle, ...(channel ? { channel_id: channel } : {}) }),
  );
  return {
    play: (link: string, title: string, position: QueuePosition, shuffle: boolean) =>
      mutation.mutate(
        { link, title, position, shuffle },
        {
          onSuccess: (data) => {
            const result = data as SetPlayResult;
            const skipped = result.skipped > 0 ? ` (${result.skipped} skipped)` : "";
            toast("ok", `Queued ${result.queued} track${result.queued === 1 ? "" : "s"} from ${title}${skipped}`);
          },
        },
      ),
    pending: mutation.isPending ? mutation.variables : undefined,
  };
}

export function totalSeconds(listing: SetListing): number | null {
  const sum = listing.tracks.reduce((total, track) => total + (track.duration_seconds ?? 0), 0);
  return sum > 0 ? Math.round(sum) : null;
}

export function ShuffleToggle({ on, onChange, disabled }: { on: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className={on ? "text-accent" : ""}
      aria-pressed={on}
      aria-label={on ? "Shuffle is on" : "Shuffle is off"}
      title={on ? "Sets are queued shuffled" : "Sets are queued in order"}
      disabled={disabled}
      onClick={() => onChange(!on)}
      icon={Shuffle}
    />
  );
}

/**
 * A pasted SoundCloud set: its title and length, queue it whole, save it, or
 * open its track list. `renderTrack` draws one `<li>` of the list (save or play
 * the track like any single result). Without `canQueue` only the list is offered,
 * which is what ambience and effects need.
 */
export function SetCard({
  link,
  canQueue,
  playable,
  channel,
  onSave,
  saved,
  saving,
  renderTrack,
  openByDefault = false,
}: {
  link: string;
  canQueue: boolean;
  playable: boolean;
  channel?: string;
  onSave?: (listing: SetListing) => void;
  saved?: boolean;
  saving?: boolean;
  renderTrack: (track: Track) => ReactNode;
  openByDefault?: boolean;
}) {
  const listing = useSetListing(link);
  const [shuffle, setShuffle] = useSetShuffle();
  const { play, pending } = useSetPlay(channel);
  const [open, setOpen] = useState(openByDefault);

  if (listing.isPending) return <Skeleton className="h-24" />;
  if (listing.isError) {
    return <Notice tone="warn" title="Could not read that set">{listing.error instanceof BotError ? listing.error.message : "Try again in a moment."}</Notice>;
  }

  const data = listing.data;
  const length = totalSeconds(data);
  const busy = pending !== undefined;
  const queue = (position: QueuePosition) => play(link, data.title, position, shuffle);

  return (
    <div className="rounded-2xl border border-border">
      <div className="flex flex-wrap items-center gap-3 px-3 py-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Disc3 className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold" title={data.title}>
              {data.title}
            </span>
            <Badge tone="accent">Set</Badge>
          </div>
          <div className="text-xs text-muted">
            {data.tracks.length} track{data.tracks.length === 1 ? "" : "s"}
            {length ? ` · ${formatDuration(length)}` : ""}
            {data.truncated ? " · first 50 only" : ""}
            {data.skipped ? ` · ${data.skipped} not playable` : ""}
          </div>
        </div>
        {canQueue ? (
          <div className="flex flex-wrap items-center gap-1">
            <ShuffleToggle on={shuffle} onChange={setShuffle} />
            <Button size="icon" variant="primary" icon={Play} aria-label={`Play ${data.title} now`} title="Play now" busy={pending?.position === "now"} disabled={!playable || busy} onClick={() => queue("now")} />
            <Button size="icon" icon={ListStart} aria-label={`Play ${data.title} next`} title="Play next" busy={pending?.position === "next"} disabled={!playable || busy} onClick={() => queue("next")} />
            <Button size="icon" icon={ListEnd} aria-label={`Add ${data.title} to the queue`} title="Add to the queue" busy={pending?.position === "end"} disabled={!playable || busy} onClick={() => queue("end")} />
            {onSave ? (
              <Button size="sm" variant="primary" icon={saved ? undefined : Save} busy={saving} disabled={saved || saving} onClick={() => onSave(data)}>
                {saved ? "Saved" : "Save set"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-xs font-medium text-muted transition hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ChevronDown className={`size-3.5 transition ${open ? "rotate-180" : ""}`} aria-hidden />
        {open ? "Hide tracks" : "Show tracks"}
      </button>
      {open ? (
        <ul className="divide-y divide-border border-t border-border" aria-label={`Tracks in ${data.title}`}>
          {data.tracks.map((track) => (
            <Fragment key={track.id}>{renderTrack(track)}</Fragment>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
