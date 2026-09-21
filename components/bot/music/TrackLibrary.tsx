"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Library, Play, Search, Tag, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { bot, BotError } from "@/lib/bot/client";
import type { PlayerState, Track } from "@/lib/bot/types";
import { formatDuration } from "@/lib/format";
import { useLibrary, useMusicMutation } from "@/lib/bot/useBotState";
import { dm } from "@/lib/dm/client";
import { bucketRef, hasAllTags, tagCounts } from "@/lib/dm/tags";
import { TAGS_KEY, useTags } from "@/lib/dm/useTags";
import { useLocalValue } from "@/lib/useLocalValue";
import { ConfirmDialog } from "../../ConfirmDialog";
import { TagChips, TagDialog, TagFilter } from "../../dm/Tags";
import { useToast } from "../../Providers";
import { Button, Card, EmptyState, inputClass, Notice, Skeleton } from "../../ui";

export function usePlay(state: PlayerState) {
  const toast = useToast();
  const [channelId] = useLocalValue("portal.bot.voiceChannelId");
  const hasChannel = /^\d{17,20}$/.test(channelId.trim());
  const play = useMusicMutation((track: Track) =>
    bot.play({
      source: track.source,
      id: track.id,
      // Not in voice yet: join the remembered channel as part of play.
      ...(!state.connected && hasChannel ? { channel_id: channelId.trim() } : {}),
    }),
  );
  return {
    play: (track: Track) =>
      play.mutate(track, { onSuccess: () => toast("ok", state.current ? `Queued: ${track.title}` : `Playing: ${track.title}`) }),
    pendingId: play.isPending ? play.variables?.id : undefined,
    needsChannel: !state.connected && !hasChannel,
  };
}

export function TrackRow({
  track,
  onPlay,
  busy,
  enabled,
  playing,
  onDelete,
  tags,
  onEditTags,
}: {
  track: Track;
  onPlay: () => void;
  busy: boolean;
  enabled: boolean;
  playing?: boolean;
  onDelete?: () => void;
  // Given only to the DM, who is the one that can read and change tags.
  tags?: readonly string[];
  onEditTags?: () => void;
}) {
  return (
    <li className={`group flex items-center gap-3 px-5 py-2.5 transition hover:bg-surface-2/60 ${playing ? "bg-accent-soft" : ""}`}>
      <Button
        size="icon"
        variant={playing ? "primary" : "secondary"}
        className="rounded-full"
        disabled={!enabled}
        busy={busy}
        onClick={onPlay}
        aria-label={`Play ${track.title}`}
      >
        {!busy && <Play className="ml-0.5 size-4" aria-hidden />}
      </Button>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm ${playing ? "font-semibold text-accent" : "font-medium"}`} title={track.title}>
          {track.title}
        </div>
        {tags && tags.length > 0 ? <TagChips tags={tags} max={4} className="mt-1" /> : null}
      </div>
      <span className="font-mono text-xs tabular-nums text-muted">{formatDuration(track.duration_seconds)}</span>
      {onEditTags && (
        <Button
          size="icon"
          variant="ghost"
          className="opacity-70 transition group-hover:opacity-100 focus-visible:opacity-100"
          onClick={onEditTags}
          aria-label={`Edit tags for ${track.title}`}
          title="Edit tags"
        >
          <Tag className="size-4" aria-hidden />
        </Button>
      )}
      {onDelete && (
        <Button
          size="icon"
          variant="danger-ghost"
          className="opacity-70 transition group-hover:opacity-100 focus-visible:opacity-100"
          disabled={!enabled || playing}
          onClick={onDelete}
          aria-label={`Delete ${track.title}`}
          title={playing ? "Stop it before deleting" : "Delete from the bucket"}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      )}
    </li>
  );
}

export function TrackLibrary({ state, enabled, canManage = false }: { state: PlayerState; enabled: boolean; canManage?: boolean }) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(id);
  }, [input]);

  const library = useLibrary(q);
  const { play, pendingId, needsChannel } = usePlay(state);
  const toast = useToast();
  const client = useQueryClient();
  const [deleting, setDeleting] = useState<Track | null>(null);
  const tagged = useTags(canManage);
  const [picked, setPicked] = useState<string[]>([]);
  const [editingTags, setEditingTags] = useState<{ ref: string; title: string; tags: readonly string[] } | null>(null);
  const tracks = useMemo(() => library.data ?? [], [library.data]);
  const tagsOf = (track: Track) => tagged.tagsOf(bucketRef(track.id));
  const shown = tracks.filter((track) => hasAllTags(tagsOf(track), picked));
  // Tags offered are the ones on the tracks listed, so a chip never leads to an empty list.
  const libraryTags = useMemo(() => tagCounts(Object.fromEntries(tracks.map((track) => [track.id, tagged.tagsOf(bucketRef(track.id))]))), [tracks, tagged]);
  const allTagNames = useMemo(() => tagged.counts.map((entry) => entry.tag), [tagged.counts]);
  const remove = useMutation({
    mutationFn: (track: Track) => bot.deleteTrack(track.id),
    onSuccess: (_data, track) => {
      toast("ok", `Deleted ${track.title}`);
      setDeleting(null);
      void client.invalidateQueries({ queryKey: ["bot", "music", "library"] });
      // Its tags have nothing left to describe. A failure here only leaves a stray row that nothing lists.
      if (canManage && tagsOf(track).length > 0) {
        void dm
          .setTags(bucketRef(track.id), [])
          .catch(() => undefined)
          .finally(() => void client.invalidateQueries({ queryKey: TAGS_KEY }));
      }
    },
    onError: (error) => toast("danger", error instanceof BotError ? error.message : "Could not delete that track."),
  });

  if (state.sources.r2 === false) {
    return (
      <Card title="Library" icon={Library}>
        <EmptyState icon={Library} title="Library is off">
          The track library source is turned off on the bot.
        </EmptyState>
      </Card>
    );
  }

  return (
    <Card
      title="Library"
      subtitle={library.data ? `${library.data.length} tracks` : undefined}
      icon={Library}
      padded={false}
      action={
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <input
            type="search"
            className={`${inputClass} h-9 pl-9`}
            placeholder="Filter tracks"
            aria-label="Filter tracks"
            maxLength={200}
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </div>
      }
    >
      {needsChannel && (
        <div className="px-5 pt-4">
          <Notice tone="warn">The bot is not in voice. Join a channel from the player above first.</Notice>
        </div>
      )}
      {canManage && libraryTags.length > 0 ? (
        <div className="px-5 pt-4">
          <TagFilter counts={libraryTags} selected={picked} onChange={setPicked} />
        </div>
      ) : null}
      {library.isPending ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : library.isError ? (
        <EmptyState icon={Library} title="Library unavailable">
          {library.error.message}
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState icon={Search} title={q || picked.length > 0 ? "No tracks match" : "The library is empty"} />
      ) : (
        <ul className="max-h-[34rem] divide-y divide-border overflow-y-auto py-1">
          {shown.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              enabled={enabled}
              busy={pendingId === track.id}
              playing={state.current?.id === track.id}
              onPlay={() => play(track)}
              onDelete={canManage ? () => setDeleting(track) : undefined}
              tags={canManage ? tagsOf(track) : undefined}
              onEditTags={canManage ? () => setEditingTags({ ref: bucketRef(track.id), title: track.title, tags: tagsOf(track) }) : undefined}
            />
          ))}
        </ul>
      )}
      {canManage ? <TagDialog target={editingTags} suggestions={allTagNames} onClose={() => setEditingTags(null)} /> : null}
      <ConfirmDialog
        open={deleting !== null}
        title="Delete this track?"
        confirmLabel="Delete"
        busy={remove.isPending}
        onClose={() => !remove.isPending && setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
      >
        <p>
          <span className="font-medium text-text">{deleting?.title}</span> will be removed from the music bucket. This cannot be undone.
        </p>
      </ConfirmDialog>
    </Card>
  );
}
