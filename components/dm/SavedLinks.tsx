"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CloudDownload, CloudRain, ExternalLink, Link2, ListEnd, ListStart, Music2, Pencil, Play, Save, Search, Square, Trash2, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Providers";
import { Badge, Button, EmptyState, Field, inputClass, Notice, Skeleton } from "@/components/ui";
import { bot, BotError } from "@/lib/bot/client";
import type { QueuePosition, SoundKind, Track } from "@/lib/bot/types";
import { keys, useMusicState, useSoundboard } from "@/lib/bot/useBotState";
import { useCampaignSelection, useDmDefaultCampaign } from "@/lib/campaign/useSelection";
import { dm, DmError } from "@/lib/dm/client";
import { SAVED_KINDS, type SavedKind, type SavedTrack } from "@/lib/dm/saved";
import { savedRef, hasAllTags, tagCounts, tagsSchema } from "@/lib/dm/tags";
import { SAVED_KEY, useSaved } from "@/lib/dm/useSaved";
import { TAGS_KEY, useTags } from "@/lib/dm/useTags";
import { formatDuration } from "@/lib/format";
import { detectLink, isSetRef, refFromTrack, trackUrl, WEB_SOURCES, WEB_SOURCE_LABEL, type WebSource } from "@/lib/webAudio";
import { SetCard, ShuffleToggle, totalSeconds, useSetShuffle } from "../bot/music/SetCard";
import { TagChips, TagFilter, TagInput } from "./Tags";
import { useVoiceTarget } from "./Soundboard";

const KIND_LABEL: Record<SavedKind, string> = { music: "Music", ambience: "Ambience", sfx: "Effects" };
const KIND_HINT: Record<SavedKind, string> = {
  music: "Play now, play next or add to the queue. Albums and playlists queue whole.",
  ambience: "Loops under the music. Tap again to stop.",
  sfx: "Plays once. Saved on the bot the first time, then instant.",
};
const KIND_ICON = { music: Music2, ambience: CloudRain, sfx: Zap } as const;

function errorText(error: unknown, fallback: string) {
  return error instanceof BotError || error instanceof DmError ? error.message : fallback;
}

function IconLink({ source, reference, title }: { source: WebSource; reference: string; title: string }) {
  const label = WEB_SOURCE_LABEL[source];
  return (
    <a
      href={trackUrl(source, reference)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${title} on ${label}`}
      title={`Open on ${label}`}
      className="inline-grid size-9 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <ExternalLink className="size-4" aria-hidden />
    </a>
  );
}

function EditRow({ item, tags: current, suggestions, onDone }: { item: SavedTrack; tags: readonly string[]; suggestions: readonly string[]; onDone: () => void }) {
  const toast = useToast();
  const client = useQueryClient();
  const [title, setTitle] = useState(item.title);
  const [tags, setTags] = useState<string[]>([...current]);
  const save = useMutation({
    // The campaign is left out on purpose: an edit here keeps it as it is.
    mutationFn: async () => {
      await dm.updateSaved(item.id, { source: item.source, kind: item.kind, ref: item.ref, title, durationSeconds: item.durationSeconds });
      await dm.setTags(savedRef(item.id), tags);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: SAVED_KEY });
      void client.invalidateQueries({ queryKey: TAGS_KEY });
      onDone();
    },
    onError: (error) => toast("danger", errorText(error, "Could not save the change.")),
  });
  return (
    <form
      className="grid gap-3 rounded-2xl border border-accent/40 bg-surface p-3 grid-cols-1 sm:grid-cols-[1fr_1fr_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim()) save.mutate();
      }}
    >
      <Field label="Title">
        <input className={`${inputClass} h-10`} value={title} maxLength={200} required onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field label="Tags" hint="Separate with a comma.">
        <TagInput value={tags} onChange={setTags} suggestions={suggestions} disabled={save.isPending} />
      </Field>
      <div className="flex items-end gap-2">
        <Button type="submit" variant="primary" icon={Save} busy={save.isPending} disabled={!title.trim()}>
          Save
        </Button>
        <Button onClick={onDone} disabled={save.isPending} aria-label="Cancel">
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * Saved YouTube and SoundCloud links: music for the queue, ambience loops and
 * one-shot effects, each with as many tags as you like. The list lives in the portal; playing is the browser
 * calling the same bot endpoints as everything else on this page.
 */
export function SavedLinks() {
  const toast = useToast();
  const client = useQueryClient();
  const [selection] = useCampaignSelection();
  const campaignForNew = useDmDefaultCampaign();
  const voice = useVoiceTarget();
  const music = useMusicState();
  const board = useSoundboard();
  const saved = useSaved(selection);
  const tagged = useTags();

  const [kind, setKind] = useState<SavedKind>("music");
  const [picked, setPicked] = useState<WebSource | null>(null);
  const [text, setText] = useState("");
  const [tagText, setTagText] = useState("");
  const [filter, setFilter] = useState("");
  const [pickedTags, setPickedTags] = useState<string[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SavedTrack | null>(null);
  const [preparing, setPreparing] = useState<string | null>(null);
  const [shuffle, setShuffle] = useSetShuffle();

  // Until the bot answers, assume a source is on; afterwards only what it reports.
  const sourceOn = (name: WebSource) => (music.data ? music.data.sources[name] === true : true);
  const anyOn = WEB_SOURCES.some(sourceOn);
  const source: WebSource = picked ?? (sourceOn("youtube") ? "youtube" : "soundcloud");
  const sourceLabel = WEB_SOURCE_LABEL[source];
  const channel = voice.channelId ? { channel_id: voice.channelId } : {};
  const layers = useMemo(() => board.data?.layers ?? [], [board.data]);
  const items = useMemo(() => saved.data ?? [], [saved.data]);
  const mine = useMemo(() => items.filter((item) => item.kind === kind), [items, kind]);
  const needle = filter.trim().toLowerCase();
  // Tags offered are the ones on this tab's links, so a chip never leads to an empty list.
  const tabTags = useMemo(() => tagCounts(Object.fromEntries(mine.map((item) => [item.id, tagged.tagsOf(savedRef(item.id))]))), [mine, tagged]);
  const allTagNames = useMemo(() => tagged.counts.map((entry) => entry.tag), [tagged.counts]);
  const visible = useMemo(
    () =>
      mine.filter((item) => {
        const tags = tagged.tagsOf(savedRef(item.id));
        return hasAllTags(tags, pickedTags) && (!needle || `${item.title} ${tags.join(" ")}`.toLowerCase().includes(needle));
      }),
    [mine, needle, pickedTags, tagged],
  );

  const refreshBot = () => {
    void client.invalidateQueries({ queryKey: keys.music });
    void client.invalidateQueries({ queryKey: keys.soundboard });
  };

  async function run(id: string, action: () => Promise<unknown>, done?: string) {
    setPending(id);
    try {
      await action();
      if (done) toast("ok", done);
    } catch (error) {
      toast("danger", errorText(error, "The bot did not answer."));
    } finally {
      setPending(null);
      refreshBot();
    }
  }

  const playMusic = (item: SavedTrack, position: QueuePosition) =>
    isSetRef(item.source, item.ref)
      ? run(item.id, async () => {
          // A saved album or playlist is queued whole, in order or shuffled.
          const result = await bot.playSet({ id: trackUrl(item.source, item.ref), position, shuffle, ...channel });
          const skipped = result.skipped > 0 ? ` (${result.skipped} skipped)` : "";
          toast("ok", `Queued ${result.queued} track${result.queued === 1 ? "" : "s"} from ${item.title}${skipped}`);
        })
      : run(item.id, () => bot.play({ source: item.source, id: trackUrl(item.source, item.ref), position, ...channel }), position === "now" ? `Playing ${item.title}` : `Queued ${item.title}`);

  const ambienceLayer = (item: SavedTrack) => layers.find((layer) => layer.kind === "ambience" && layer.track_id === trackUrl(item.source, item.ref));

  const toggleAmbience = (item: SavedTrack) => {
    const active = ambienceLayer(item);
    return run(item.id, () =>
      active
        ? bot.stopSound({ layer_id: active.id })
        : bot.playSound({ kind: "ambience", id: trackUrl(item.source, item.ref), source: item.source, ...channel }),
    );
  };

  const fireEffect = (item: SavedTrack) =>
    run(item.id, () => bot.playSound({ kind: "sfx", id: trackUrl(item.source, item.ref), source: item.source, ...channel }));

  const prepareOne = (item: SavedTrack) =>
    run(item.id, () => bot.prepareSound({ kind: item.kind as SoundKind, id: trackUrl(item.source, item.ref), source: item.source }), `${item.title} is ready.`);

  async function prepareAll() {
    // A sound from a service the bot has turned off can only fail.
    const sounds = mine.filter((item) => item.kind !== "music" && sourceOn(item.source));
    let failed = 0;
    for (const [index, item] of sounds.entries()) {
      setPreparing(`${index + 1}/${sounds.length}`);
      try {
        await bot.prepareSound({ kind: item.kind as SoundKind, id: trackUrl(item.source, item.ref), source: item.source });
      } catch {
        failed += 1;
      }
    }
    setPreparing(null);
    void client.invalidateQueries({ queryKey: keys.soundboard });
    toast(failed ? "danger" : "ok", failed ? `${sounds.length - failed} ready, ${failed} could not be saved.` : `${sounds.length} sounds are ready.`);
  }

  // A pasted link is looked up as that one item, on whichever service it names;
  // a SoundCloud album or playlist link becomes a set card; anything else is a
  // search on the chosen service.
  const lookup = useMutation({
    mutationFn: async (query: string): Promise<{ source: WebSource; tracks: Track[]; set?: { ref: string; link: string } }> => {
      const found = detectLink(query);
      const name = found?.source ?? source;
      if (!sourceOn(name)) throw new BotError(409, "source_disabled", `${WEB_SOURCE_LABEL[name]} is turned off on the bot.`);
      if (found?.set) return { source: name, tracks: [], set: { ref: found.ref, link: trackUrl(name, found.ref) } };
      const tracks = await bot.search(name, found ? trackUrl(found.source, found.ref) : query.slice(0, 200));
      return { source: name, tracks };
    },
    onError: (error) => toast("danger", errorText(error, `${sourceLabel} did not answer.`)),
  });

  async function save(track: Track, name: WebSource, ref: string) {
    setPending(ref);
    try {
      // A sound is downloaded first: it proves the track fits the limits, and
      // the first play at the table is then instant.
      const wanted = tagsSchema.safeParse(tagText.split(",").map((part) => part.trim()).filter(Boolean));
      if (!wanted.success) {
        toast("danger", `Tags: ${wanted.error.issues[0]?.message ?? "not valid"}.`);
        return;
      }
      if (kind !== "music") await bot.prepareSound({ kind, id: trackUrl(name, ref), source: name });
      const created = await dm.createSaved({
        source: name,
        kind,
        ref,
        title: track.title,
        // A set's length is the sum of its tracks, kept within what the table allows.
        durationSeconds: track.duration_seconds ? Math.min(86_400, Math.max(1, Math.round(track.duration_seconds))) : null,
        campaignId: campaignForNew,
      });
      if (wanted.data.length > 0) {
        try {
          await dm.setTags(savedRef(created.id), wanted.data);
        } catch {
          toast("danger", "Saved, but the tags could not be added.");
        }
      }
      toast("ok", `Saved ${track.title}`);
      void client.invalidateQueries({ queryKey: SAVED_KEY });
      void client.invalidateQueries({ queryKey: TAGS_KEY });
    } catch (error) {
      toast("danger", errorText(error, "Could not save that link."));
    } finally {
      setPending(null);
    }
  }

  const remove = useMutation({
    mutationFn: (item: SavedTrack) => dm.deleteSaved(item.id),
    onSuccess: () => void client.invalidateQueries({ queryKey: SAVED_KEY }),
    onError: (error) => toast("danger", errorText(error, "Could not delete that link.")),
    onSettled: () => setDeleting(null),
  });

  const isSaved = (from: WebSource, ref: string) =>
    items.some((item) => item.source === from && item.kind === kind && item.ref === ref && (item.campaignId ?? null) === campaignForNew);

  // One search result (or one track of a set): open it, or save it to this tab.
  const resultRow = (track: Track, from: WebSource) => {
    const ref = refFromTrack(from, track.id);
    const already = ref !== null && isSaved(from, ref);
    return (
      <li key={track.id} className="flex items-center gap-3 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium" title={track.title}>
            {track.title}
          </div>
          <div className="text-xs text-muted">
            {formatDuration(track.duration_seconds)} · {WEB_SOURCE_LABEL[from]}
          </div>
        </div>
        {ref ? <IconLink source={from} reference={ref} title={track.title} /> : null}
        <Button
          size="sm"
          variant="primary"
          icon={already ? undefined : Save}
          busy={ref !== null && pending === ref}
          disabled={!ref || already || busy}
          onClick={() => ref && void save(track, from, ref)}
        >
          {already ? "Saved" : kind === "music" ? "Save" : "Save and get ready"}
        </Button>
      </li>
    );
  };

  const Icon = KIND_ICON[kind];
  const sounds = mine.filter((item) => item.kind !== "music" && sourceOn(item.source)).length;
  // One bot action at a time: a single play or save, or the whole "get all ready" run.
  const busy = pending !== null || preparing !== null;

  return (
    <section aria-label="Saved links" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
          <Link2 className="size-5 text-accent" aria-hidden /> YouTube and SoundCloud
        </h2>
        <div role="tablist" aria-label="Kind of sound" className="inline-flex rounded-xl border border-border bg-surface-2 p-1">
          {SAVED_KINDS.map((value) => {
            const TabIcon = KIND_ICON[value];
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={kind === value}
                onClick={() => {
                  setKind(value);
                  setTagText("");
                  setPickedTags([]);
                  setFilter("");
                  lookup.reset();
                  setEditing(null);
                }}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  kind === value ? "bg-accent text-accent-fg" : "text-muted hover:text-text"
                }`}
              >
                <TabIcon className="size-3.5" aria-hidden />
                {KIND_LABEL[value]}
              </button>
            );
          })}
        </div>
      </div>

      {!anyOn ? (
        <Notice tone="warn" title="Web music is turned off on the bot">
          Saved links cannot be played or added until the bot has YouTube or SoundCloud enabled.
        </Notice>
      ) : !sourceOn(source) ? (
        <Notice tone="warn" title={`${sourceLabel} is turned off on the bot`}>
          Pick another service to search, or paste a link.
        </Notice>
      ) : null}
      {!voice.ready && voice.presence.kind !== "loading" ? <Notice tone="warn">Playing goes through the bot, which is not in a voice channel yet.</Notice> : null}

      <div role="tabpanel" className="space-y-4">
        <form
          className="grid gap-3 rounded-2xl border border-border bg-surface-2 p-3 grid-cols-1 sm:grid-cols-[1fr_9rem_11rem_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            if (text.trim()) lookup.mutate(text.trim());
          }}
        >
          <Field label={`Paste a link or search ${sourceLabel}`} hint={KIND_HINT[kind]}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
              <input
                type="search"
                className={`${inputClass} h-10 pl-10`}
                placeholder={kind === "music" ? "A link, an album or playlist, or tavern music" : kind === "ambience" ? "rain on a roof, 10 hours" : "door slam sound effect"}
                // Room for a full album or playlist link; a typed search is cut to 200.
                maxLength={300}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </div>
          </Field>
          <Field label="Service">
            <select className={`${inputClass} h-10`} value={source} onChange={(event) => setPicked(event.target.value as WebSource)}>
              {WEB_SOURCES.map((name) => (
                <option key={name} value={name} disabled={!sourceOn(name)}>
                  {WEB_SOURCE_LABEL[name]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tags" hint="Comma-separated. Optional.">
            <input className={`${inputClass} h-10`} value={tagText} maxLength={200} placeholder="tavern, night" onChange={(event) => setTagText(event.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" variant="primary" icon={Search} className="h-10 w-full" busy={lookup.isPending} disabled={!anyOn || !text.trim()}>
              Find
            </Button>
          </div>
        </form>

        {lookup.data?.set ? (
          <SetCard
            key={`${lookup.data.set.link}:${kind}`}
            link={lookup.data.set.link}
            // A set is queued and saved as music; ambience and effects pick single tracks from it.
            canQueue={kind === "music"}
            playable={voice.ready && sourceOn("soundcloud")}
            channel={voice.channelId}
            onSave={(listing) => {
              const set = lookup.data?.set;
              if (set) void save({ id: set.link, title: listing.title, source: "soundcloud", duration_seconds: totalSeconds(listing) }, "soundcloud", set.ref);
            }}
            saved={isSaved("soundcloud", lookup.data.set.ref)}
            saving={pending === lookup.data.set.ref}
            renderTrack={(track) => resultRow(track, "soundcloud")}
            openByDefault={kind !== "music"}
          />
        ) : lookup.data ? (
          lookup.data.tracks.length === 0 ? (
            <p className="text-sm text-faint">Nothing found.</p>
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border" aria-label="Results">
              {lookup.data.tracks.map((track) => resultRow(track, lookup.data.source))}
            </ul>
          )
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
            <input type="search" className={`${inputClass} h-9 pl-9`} placeholder={`Find in ${KIND_LABEL[kind].toLowerCase()}`} aria-label={`Find in ${KIND_LABEL[kind].toLowerCase()}`} maxLength={80} value={filter} onChange={(event) => setFilter(event.target.value)} />
          </div>
          {kind !== "music" ? (
            <Button size="sm" icon={CloudDownload} busy={preparing !== null} disabled={sounds === 0 || !anyOn || pending !== null} onClick={() => void prepareAll()}>
              {preparing ? `Getting ready ${preparing}` : "Get all ready"}
            </Button>
          ) : null}
        </div>

        <TagFilter counts={tabTags} selected={pickedTags} onChange={setPickedTags} />

        {saved.isPending ? (
          <Skeleton className="h-24" />
        ) : saved.isError ? (
          <Notice title="The library is unavailable">{errorText(saved.error, "Try again in a moment.")}</Notice>
        ) : visible.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border">
            <EmptyState icon={Icon} title={needle || pickedTags.length > 0 ? "Nothing matches" : `No ${KIND_LABEL[kind].toLowerCase()} saved yet`}>
              {needle || pickedTags.length > 0 ? "Try another word or tag." : "Paste a YouTube or SoundCloud link, or search above, then choose Save."}
            </EmptyState>
          </div>
        ) : (
          <ul className="grid gap-2 grid-cols-1 sm:grid-cols-2">
            {visible.map((item) =>
              editing === item.id ? (
                <li key={item.id} className="sm:col-span-2">
                  <EditRow item={item} tags={tagged.tagsOf(savedRef(item.id))} suggestions={allTagNames} onDone={() => setEditing(null)} />
                </li>
              ) : (
                <li
                  key={item.id}
                  className={`@container rounded-2xl border p-2 pl-3 ${
                    (item.kind === "ambience" && ambienceLayer(item)) || (item.kind === "music" && music.data?.current?.id === trackUrl(item.source, item.ref))
                      ? "border-accent bg-accent-soft"
                      : "border-border bg-surface-2"
                  }`}
                >
                  {/* Narrow rows put the actions on a line of their own so the title stays readable. */}
                  <div className="flex flex-wrap items-center justify-end gap-2 @md:flex-nowrap">
                    <div className="min-w-0 flex-1 basis-full @md:basis-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium" title={item.title}>
                          {item.title}
                        </span>
                        {isSetRef(item.source, item.ref) ? <Badge tone="accent">Set</Badge> : null}
                      </div>
                      <div className="text-xs text-muted">
                        {formatDuration(item.durationSeconds)} · {WEB_SOURCE_LABEL[item.source]}
                      </div>
                      <TagChips tags={tagged.tagsOf(savedRef(item.id))} className="mt-1" />
                    </div>
                    {item.kind === "music" ? (
                      <>
                        {isSetRef(item.source, item.ref) ? <ShuffleToggle on={shuffle} onChange={setShuffle} /> : null}
                        <Button size="icon" variant="primary" aria-label={`Play ${item.title} now`} title="Play now" icon={Play} busy={pending === item.id} disabled={!voice.ready || busy || !sourceOn(item.source)} onClick={() => void playMusic(item, "now")} />
                        <Button size="icon" aria-label={`Play ${item.title} next`} title="Play next" icon={ListStart} disabled={!voice.ready || busy || !sourceOn(item.source)} onClick={() => void playMusic(item, "next")} />
                        <Button size="icon" aria-label={`Add ${item.title} to the queue`} title="Add to the queue" icon={ListEnd} disabled={!voice.ready || busy || !sourceOn(item.source)} onClick={() => void playMusic(item, "end")} />
                      </>
                    ) : item.kind === "ambience" ? (
                      <Button
                        size="sm"
                        variant={ambienceLayer(item) ? "primary" : "secondary"}
                        icon={ambienceLayer(item) ? Square : CloudRain}
                        aria-pressed={Boolean(ambienceLayer(item))}
                        aria-label={`${ambienceLayer(item) ? "Stop" : "Loop"} ${item.title}`}
                        busy={pending === item.id}
                        disabled={!voice.ready || busy || !sourceOn(item.source)}
                        onClick={() => void toggleAmbience(item)}
                      >
                        {ambienceLayer(item) ? "Stop" : "Loop"}
                      </Button>
                    ) : (
                      <Button size="sm" icon={Zap} aria-label={`Play ${item.title} once`} busy={pending === item.id} disabled={!voice.ready || busy || !sourceOn(item.source)} onClick={() => void fireEffect(item)}>
                        Play
                      </Button>
                    )}
                    {item.kind !== "music" ? (
                      <Button size="icon" variant="ghost" aria-label={`Get ${item.title} ready`} title="Save it on the bot now, so it starts at once" icon={CloudDownload} disabled={busy || !sourceOn(item.source)} onClick={() => void prepareOne(item)} />
                    ) : null}
                    <IconLink source={item.source} reference={item.ref} title={item.title} />
                    <Button size="icon" variant="ghost" aria-label={`Edit ${item.title}`} icon={Pencil} onClick={() => setEditing(item.id)} />
                    <Button size="icon" variant="danger-ghost" aria-label={`Delete ${item.title}`} icon={Trash2} onClick={() => setDeleting(item)} />
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.title ?? "link"}?`}
        confirmLabel="Delete"
        busy={remove.isPending}
        onClose={() => !remove.isPending && setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
      >
        <p>Only the saved link is removed. Scenes that use the same track are not affected.</p>
      </ConfirmDialog>
    </section>
  );
}
