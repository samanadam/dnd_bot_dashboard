"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CloudDownload, CloudRain, ExternalLink, Link2, ListEnd, ListStart, Music2, Pencil, Play, Save, Search, Square, Trash2, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Providers";
import { Button, EmptyState, Field, inputClass, Notice, Skeleton } from "@/components/ui";
import { bot, BotError } from "@/lib/bot/client";
import type { QueuePosition, SoundKind, Track } from "@/lib/bot/types";
import { keys, useMusicState, useSoundboard } from "@/lib/bot/useBotState";
import { useCampaignSelection } from "@/lib/campaign/useSelection";
import { dm, DmError } from "@/lib/dm/client";
import { SAVED_KINDS, type SavedKind, type SavedTrack } from "@/lib/dm/saved";
import { SAVED_KEY, useSaved } from "@/lib/dm/useSaved";
import { formatDuration } from "@/lib/format";
import { detectLink, refFromTrack, trackUrl, WEB_SOURCES, WEB_SOURCE_LABEL, type WebSource } from "@/lib/webAudio";
import { useVoiceTarget } from "./Soundboard";

const KIND_LABEL: Record<SavedKind, string> = { music: "Music", ambience: "Ambience", sfx: "Effects" };
const KIND_HINT: Record<SavedKind, string> = {
  music: "Play now, play next or add to the queue.",
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

function EditRow({ item, categories, onDone }: { item: SavedTrack; categories: string[]; onDone: () => void }) {
  const toast = useToast();
  const client = useQueryClient();
  const [title, setTitle] = useState(item.title);
  const [category, setCategory] = useState(item.category);
  const save = useMutation({
    // The campaign is left out on purpose: an edit here keeps it as it is.
    mutationFn: () =>
      dm.updateSaved(item.id, { source: item.source, kind: item.kind, ref: item.ref, title, durationSeconds: item.durationSeconds, category }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: SAVED_KEY });
      onDone();
    },
    onError: (error) => toast("danger", errorText(error, "Could not save the change.")),
  });
  return (
    <form
      className="grid gap-3 rounded-2xl border border-accent/40 bg-surface p-3 sm:grid-cols-[1fr_12rem_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim()) save.mutate();
      }}
    >
      <Field label="Title">
        <input className={`${inputClass} h-10`} value={title} maxLength={200} required onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field label="Category">
        <input className={`${inputClass} h-10`} value={category} maxLength={40} list="saved-categories-edit" onChange={(event) => setCategory(event.target.value)} />
        <datalist id="saved-categories-edit">
          {categories.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
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
 * one-shot effects, filed under categories. The list lives in the portal; playing is the browser
 * calling the same bot endpoints as everything else on this page.
 */
export function SavedLinks() {
  const toast = useToast();
  const client = useQueryClient();
  const [selection] = useCampaignSelection();
  const campaignForNew = selection && selection !== "unassigned" ? selection : null;
  const voice = useVoiceTarget();
  const music = useMusicState();
  const board = useSoundboard();
  const saved = useSaved(selection);

  const [kind, setKind] = useState<SavedKind>("music");
  const [picked, setPicked] = useState<WebSource | null>(null);
  const [text, setText] = useState("");
  const [category, setCategory] = useState("");
  const [filter, setFilter] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SavedTrack | null>(null);
  const [preparing, setPreparing] = useState<string | null>(null);

  // Until the bot answers, assume a source is on; afterwards only what it reports.
  const sourceOn = (name: WebSource) => (music.data ? music.data.sources[name] === true : true);
  const anyOn = WEB_SOURCES.some(sourceOn);
  const source: WebSource = picked ?? (sourceOn("youtube") ? "youtube" : "soundcloud");
  const sourceLabel = WEB_SOURCE_LABEL[source];
  const channel = voice.channelId ? { channel_id: voice.channelId } : {};
  const layers = useMemo(() => board.data?.layers ?? [], [board.data]);
  const items = useMemo(() => saved.data ?? [], [saved.data]);
  const mine = useMemo(() => items.filter((item) => item.kind === kind), [items, kind]);
  const categories = useMemo(() => [...new Set(mine.map((item) => item.category).filter(Boolean))], [mine]);
  const needle = filter.trim().toLowerCase();
  const visible = useMemo(() => mine.filter((item) => !needle || `${item.title} ${item.category}`.toLowerCase().includes(needle)), [mine, needle]);
  const groups = useMemo(() => {
    const byCategory = new Map<string, SavedTrack[]>();
    for (const item of visible) byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);
    return [...byCategory.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  }, [visible]);

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
    run(item.id, () => bot.play({ source: item.source, id: trackUrl(item.source, item.ref), position, ...channel }), position === "now" ? `Playing ${item.title}` : `Queued ${item.title}`);

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
    const sounds = mine.filter((item) => item.kind !== "music");
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
    toast(failed ? "danger" : "ok", failed ? `${sounds.length - failed} ready, ${failed} could not be saved.` : `${sounds.length} sounds are ready.`);
  }

  // A pasted link is looked up as that one item, on whichever service it names;
  // anything else is a search on the chosen service.
  const lookup = useMutation({
    mutationFn: async (query: string): Promise<{ source: WebSource; tracks: Track[] }> => {
      const found = detectLink(query);
      const name = found?.source ?? source;
      const tracks = await bot.search(name, found ? trackUrl(found.source, found.ref) : query);
      return { source: name, tracks };
    },
    onError: (error) => toast("danger", errorText(error, `${sourceLabel} did not answer.`)),
  });

  async function save(track: Track, name: WebSource, ref: string) {
    setPending(ref);
    try {
      // A sound is downloaded first: it proves the track fits the limits, and
      // the first play at the table is then instant.
      if (kind !== "music") await bot.prepareSound({ kind, id: trackUrl(name, ref), source: name });
      await dm.createSaved({
        source: name,
        kind,
        ref,
        title: track.title,
        durationSeconds: track.duration_seconds ? Math.max(1, Math.round(track.duration_seconds)) : null,
        category,
        campaignId: campaignForNew,
      });
      toast("ok", `Saved ${track.title}`);
      void client.invalidateQueries({ queryKey: SAVED_KEY });
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

  const Icon = KIND_ICON[kind];
  const sounds = mine.filter((item) => item.kind !== "music").length;

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
                  setCategory("");
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
          className="grid gap-3 rounded-2xl border border-border bg-surface-2 p-3 sm:grid-cols-[1fr_9rem_11rem_auto]"
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
                placeholder={kind === "music" ? "A link, or tavern music" : kind === "ambience" ? "rain on a roof, 10 hours" : "door slam sound effect"}
                maxLength={200}
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
          <Field label="Category">
            <input className={`${inputClass} h-10`} value={category} maxLength={40} list="saved-categories" placeholder="Taverns" onChange={(event) => setCategory(event.target.value)} />
            <datalist id="saved-categories">
              {categories.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </Field>
          <div className="flex items-end">
            <Button type="submit" variant="primary" icon={Search} className="h-10 w-full" busy={lookup.isPending} disabled={!anyOn || !text.trim()}>
              Find
            </Button>
          </div>
        </form>

        {lookup.data ? (
          lookup.data.tracks.length === 0 ? (
            <p className="text-sm text-faint">Nothing found.</p>
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border" aria-label="Results">
              {lookup.data.tracks.map((track) => {
                const from = lookup.data.source;
                const ref = refFromTrack(from, track.id);
                const already = ref !== null && items.some((item) => item.source === from && item.kind === kind && item.ref === ref && (item.campaignId ?? null) === campaignForNew);
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
                      disabled={!ref || already || pending !== null}
                      onClick={() => ref && void save(track, from, ref)}
                    >
                      {already ? "Saved" : kind === "music" ? "Save" : "Save and get ready"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
            <input type="search" className={`${inputClass} h-9 pl-9`} placeholder={`Find in ${KIND_LABEL[kind].toLowerCase()}`} aria-label={`Find in ${KIND_LABEL[kind].toLowerCase()}`} maxLength={80} value={filter} onChange={(event) => setFilter(event.target.value)} />
          </div>
          {kind !== "music" ? (
            <Button size="sm" icon={CloudDownload} busy={preparing !== null} disabled={sounds === 0 || !anyOn} onClick={() => void prepareAll()}>
              {preparing ? `Getting ready ${preparing}` : "Get all ready"}
            </Button>
          ) : null}
        </div>

        {saved.isPending ? (
          <Skeleton className="h-24" />
        ) : saved.isError ? (
          <Notice title="The library is unavailable">{errorText(saved.error, "Try again in a moment.")}</Notice>
        ) : groups.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border">
            <EmptyState icon={Icon} title={needle ? "Nothing matches" : `No ${KIND_LABEL[kind].toLowerCase()} saved yet`}>
              {needle ? "Try another word." : "Paste a YouTube or SoundCloud link, or search above, then choose Save."}
            </EmptyState>
          </div>
        ) : (
          groups.map(([name, group]) => (
            <div key={name || "none"} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{name || "Other"}</h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {group.map((item) =>
                  editing === item.id ? (
                    <li key={item.id} className="sm:col-span-2">
                      <EditRow item={item} categories={categories} onDone={() => setEditing(null)} />
                    </li>
                  ) : (
                    <li
                      key={item.id}
                      className={`flex items-center gap-2 rounded-2xl border p-2 pl-3 ${
                        (item.kind === "ambience" && ambienceLayer(item)) || (item.kind === "music" && music.data?.current?.id === trackUrl(item.source, item.ref))
                          ? "border-accent bg-accent-soft"
                          : "border-border bg-surface-2"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium" title={item.title}>
                          {item.title}
                        </div>
                        <div className="text-xs text-muted">
                          {formatDuration(item.durationSeconds)} · {WEB_SOURCE_LABEL[item.source]}
                        </div>
                      </div>
                      {item.kind === "music" ? (
                        <>
                          <Button size="icon" variant="primary" aria-label={`Play ${item.title} now`} title="Play now" icon={Play} busy={pending === item.id} disabled={!voice.ready || pending !== null || !sourceOn(item.source)} onClick={() => void playMusic(item, "now")} />
                          <Button size="icon" aria-label={`Play ${item.title} next`} title="Play next" icon={ListStart} disabled={!voice.ready || pending !== null || !sourceOn(item.source)} onClick={() => void playMusic(item, "next")} />
                          <Button size="icon" aria-label={`Add ${item.title} to the queue`} title="Add to the queue" icon={ListEnd} disabled={!voice.ready || pending !== null || !sourceOn(item.source)} onClick={() => void playMusic(item, "end")} />
                        </>
                      ) : item.kind === "ambience" ? (
                        <Button
                          size="sm"
                          variant={ambienceLayer(item) ? "primary" : "secondary"}
                          icon={ambienceLayer(item) ? Square : CloudRain}
                          aria-pressed={Boolean(ambienceLayer(item))}
                          aria-label={`${ambienceLayer(item) ? "Stop" : "Loop"} ${item.title}`}
                          busy={pending === item.id}
                          disabled={!voice.ready || pending !== null || !sourceOn(item.source)}
                          onClick={() => void toggleAmbience(item)}
                        >
                          {ambienceLayer(item) ? "Stop" : "Loop"}
                        </Button>
                      ) : (
                        <Button size="sm" icon={Zap} aria-label={`Play ${item.title} once`} busy={pending === item.id} disabled={!voice.ready || pending !== null || !sourceOn(item.source)} onClick={() => void fireEffect(item)}>
                          Play
                        </Button>
                      )}
                      {item.kind !== "music" ? (
                        <Button size="icon" variant="ghost" aria-label={`Get ${item.title} ready`} title="Save it on the bot now, so it starts at once" icon={CloudDownload} disabled={pending !== null || !sourceOn(item.source)} onClick={() => void prepareOne(item)} />
                      ) : null}
                      <IconLink source={item.source} reference={item.ref} title={item.title} />
                      <Button size="icon" variant="ghost" aria-label={`Edit ${item.title}`} icon={Pencil} onClick={() => setEditing(item.id)} />
                      <Button size="icon" variant="danger-ghost" aria-label={`Delete ${item.title}`} icon={Trash2} onClick={() => setDeleting(item)} />
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))
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
