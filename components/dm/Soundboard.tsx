"use client";

import { AudioLines, CloudRain, Search, Square, Tag, Upload, Volume2, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, EmptyState, inputClass, Notice, Skeleton } from "@/components/ui";
import { useToast } from "@/components/Providers";
import { bot, BotError } from "@/lib/bot/client";
import type { SoundKind, SoundLayer, Track } from "@/lib/bot/types";
import { useBotPresence, useSoundboard, useSoundboardMutation } from "@/lib/bot/useBotState";
import { bucketRef, hasAllTags, tagCounts } from "@/lib/dm/tags";
import { useTags } from "@/lib/dm/useTags";
import { useLocalValue } from "@/lib/useLocalValue";
import { TagChips, TagDialog, TagFilter } from "./Tags";

export function useVoiceTarget() {
  const presence = useBotPresence();
  const [remembered] = useLocalValue("portal.bot.voiceChannelId");
  const inVoice = presence.kind === "in_voice" || presence.kind === "recording";
  const channel = /^\d{17,20}$/.test(remembered.trim()) ? remembered.trim() : null;
  return { inVoice, channelId: inVoice ? undefined : (channel ?? undefined), ready: inVoice || channel !== null, presence };
}

function errorText(error: unknown) {
  return error instanceof BotError ? error.message : "The soundboard did not answer.";
}

function LayerChip({ layer, onStop, onVolume }: { layer: SoundLayer; onStop: () => void; onVolume: (volume: number) => void }) {
  const [draft, setDraft] = useState(layer.volume);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const Icon = layer.kind === "ambience" ? CloudRain : Zap;
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft px-3 py-2">
      <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-fg">
        <Icon className="size-4" aria-hidden />
        {layer.kind === "ambience" && <span className="absolute inset-0 animate-ping rounded-full bg-accent/30 motion-reduce:hidden" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium" title={layer.title}>
          {layer.title}
        </div>
        <label className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          <Volume2 className="size-3.5 shrink-0" aria-hidden />
          <span className="sr-only">Volume for {layer.title}</span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={draft}
            className="h-1 w-full min-w-16 accent-[var(--accent)]"
            onChange={(event) => {
              const value = Number(event.target.value);
              setDraft(value);
              clearTimeout(timer.current);
              timer.current = setTimeout(() => onVolume(value), 250);
            }}
          />
          <span className="w-9 text-right font-mono tabular-nums">{Math.round(draft * 100)}%</span>
        </label>
      </div>
      <Button size="icon" variant="ghost" onClick={onStop} aria-label={`Stop ${layer.title}`}>
        <Square className="size-3.5 fill-current" aria-hidden />
      </Button>
    </li>
  );
}

function SoundButton({
  track,
  kind,
  active,
  busy,
  disabled,
  hotkey,
  tags,
  onEditTags,
  onClick,
}: {
  track: Track;
  kind: SoundKind;
  active: boolean;
  busy: boolean;
  disabled: boolean;
  hotkey?: string;
  // Given only where tags are shown and edited, which is the full page.
  tags?: readonly string[];
  onEditTags?: () => void;
  onClick: () => void;
}) {
  const Icon = kind === "ambience" ? CloudRain : Zap;
  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || busy}
        aria-pressed={kind === "ambience" ? active : undefined}
        className={`group relative flex h-full min-h-16 w-full min-w-0 flex-col items-start justify-between gap-2 rounded-2xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 ${
          active
            ? "border-accent bg-accent text-accent-fg shadow-[0_8px_24px_-12px_var(--accent)]"
            : "border-border bg-surface-2 hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-3 active:translate-y-0"
        }`}
      >
        <span className="flex w-full items-center justify-between gap-2">
          {busy ? (
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          ) : (
            <Icon className={`size-4 ${active ? "" : kind === "ambience" ? "text-accent" : "text-warn"}`} aria-hidden />
          )}
          {hotkey && (
            <kbd className={`rounded-md border px-1.5 font-mono text-[10px] ${active ? "border-accent-fg/40" : "border-border text-faint"}`}>{hotkey}</kbd>
          )}
        </span>
        <span className="line-clamp-2 text-sm font-medium leading-tight">{track.title}</span>
        {tags && tags.length > 0 ? <TagChips tags={tags} max={2} className={`${onEditTags ? "pr-7" : ""} ${active ? "opacity-80" : ""}`} /> : null}
      </button>
      {onEditTags ? (
        <button
          type="button"
          onClick={onEditTags}
          aria-label={`Edit tags for ${track.title}`}
          title="Edit tags"
          className={`absolute bottom-2 right-2 grid size-6 place-items-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            active ? "text-accent-fg/80 hover:bg-accent-fg/15" : "text-faint hover:bg-surface-3 hover:text-text"
          }`}
        >
          <Tag className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export function Soundboard({ compact = false }: { compact?: boolean }) {
  const toast = useToast();
  const board = useSoundboard();
  const voice = useVoiceTarget();
  const tagged = useTags();
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [editingTags, setEditingTags] = useState<{ ref: string; title: string; tags: readonly string[] } | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const play = useSoundboardMutation((input: { kind: SoundKind; track: Track }) =>
    bot.playSound({ kind: input.kind, id: input.track.id, ...(voice.channelId ? { channel_id: voice.channelId } : {}) }),
  );
  const stop = useSoundboardMutation(bot.stopSound);
  const volume = useSoundboardMutation((input: { layer: SoundLayer; volume: number }) => bot.soundVolume(input.layer.id, input.volume));

  const layers = useMemo(() => board.data?.layers ?? [], [board.data]);
  const playingAmbience = useMemo(() => new Map(layers.filter((l) => l.kind === "ambience").map((l) => [l.track_id, l])), [layers]);

  const needle = filter.trim().toLowerCase();
  const tagsOf = (track: Track) => tagged.tagsOf(bucketRef(track.id));
  const matches = (track: Track) => {
    const tags = tagsOf(track);
    return hasAllTags(tags, picked) && `${track.title} ${tags.join(" ")}`.toLowerCase().includes(needle);
  };
  const ambience = (board.data?.ambience ?? []).filter(matches);
  const effects = (board.data?.sfx ?? []).filter(matches);
  // Tags offered are the ones on sounds listed here, so a chip never leads to an empty board.
  const listed = useMemo(
    () => [...(board.data?.ambience ?? []), ...(board.data?.sfx ?? [])],
    [board.data],
  );
  const boardTags = useMemo(
    () => tagCounts(Object.fromEntries(listed.map((track) => [track.id, tagged.tagsOf(bucketRef(track.id))]))),
    [listed, tagged],
  );
  const allTagNames = useMemo(() => tagged.counts.map((entry) => entry.tag), [tagged.counts]);

  function trigger(kind: SoundKind, track: Track) {
    const existing = kind === "ambience" ? playingAmbience.get(track.id) : undefined;
    setPending(track.id);
    const done = { onSettled: () => setPending(null), onError: (error: unknown) => toast("danger", errorText(error)) };
    if (existing) stop.mutate({ layer_id: existing.id }, done);
    else play.mutate({ kind, track }, done);
  }

  // Number keys fire the first nine effects on the full page.
  const effectsRef = useRef(effects);
  const triggerRef = useRef(trigger);
  useEffect(() => {
    effectsRef.current = effects;
    triggerRef.current = trigger;
  });
  useEffect(() => {
    if (compact) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.closest("input, textarea, select, [contenteditable=true]") || event.metaKey || event.ctrlKey || event.altKey)) return;
      if (!/^[1-9]$/.test(event.key)) return;
      const track = effectsRef.current[Number(event.key) - 1];
      if (track) {
        event.preventDefault();
        triggerRef.current("sfx", track);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compact]);

  if (board.isPending) {
    return (
      <div className="space-y-3" aria-busy>
        <Skeleton className="h-12" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </div>
    );
  }
  if (board.isError && !board.data) {
    return (
      <EmptyState icon={AudioLines} title="Soundboard unavailable">
        {errorText(board.error)}
      </EmptyState>
    );
  }

  const data = board.data!;
  const empty = data.ambience.length === 0 && data.sfx.length === 0;
  const disabled = !voice.ready || board.isError;
  const grid = compact ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";

  return (
    <div className="space-y-5">
      {!voice.ready && voice.presence.kind !== "loading" && (
        <Notice tone="warn">
          The bot is not in a voice channel. Join one from the{" "}
          <Link href="/bot/music" className="font-medium underline underline-offset-2">
            Music page
          </Link>{" "}
          first.
        </Notice>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <input
            id={compact ? "soundboard-filter-compact" : "soundboard-filter"}
            type="search"
            className={`${inputClass} h-9 pl-9`}
            placeholder="Find a sound"
            aria-label="Find a sound"
            maxLength={80}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        <Button
          size="sm"
          variant="danger-ghost"
          icon={Square}
          disabled={layers.length === 0}
          busy={stop.isPending && pending === null}
          onClick={() => stop.mutate({}, { onError: (error) => toast("danger", errorText(error)) })}
        >
          Stop all sounds
        </Button>
      </div>

      <TagFilter counts={boardTags} selected={picked} onChange={setPicked} />

      {layers.length > 0 && (
        <section aria-label="Playing now">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Playing now</h3>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {layers.map((layer) => (
              <LayerChip
                key={layer.id}
                layer={layer}
                onStop={() => stop.mutate({ layer_id: layer.id }, { onError: (error) => toast("danger", errorText(error)) })}
                onVolume={(value) => volume.mutate({ layer, volume: value }, { onError: (error) => toast("danger", errorText(error)) })}
              />
            ))}
          </ul>
        </section>
      )}

      {empty ? (
        <EmptyState icon={Upload} title="No sounds yet">
          Upload loops to <span className="font-medium text-text">Ambience</span> and one-shots to <span className="font-medium text-text">Effects</span>
          {compact ? (
            <>
              {" "}
              on the{" "}
              <Link href="/dm/soundboard" className="font-medium text-accent underline underline-offset-2">
                Soundboard page
              </Link>
              .
            </>
          ) : (
            " below."
          )}
        </EmptyState>
      ) : (
        <>
          <section aria-label="Ambience">
            <h3 className="mb-2 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Ambience <span className="font-normal normal-case tracking-normal text-faint">loops · up to {data.limits.ambience} at once</span>
            </h3>
            {ambience.length ? (
              <div className={`grid gap-2 ${grid}`}>
                {ambience.map((track) => (
                  <SoundButton
                    key={track.id}
                    track={track}
                    kind="ambience"
                    active={playingAmbience.has(track.id)}
                    busy={pending === track.id}
                    disabled={disabled}
                    tags={compact ? undefined : tagsOf(track)}
                    onEditTags={compact ? undefined : () => setEditingTags({ ref: bucketRef(track.id), title: track.title, tags: tagsOf(track) })}
                    onClick={() => trigger("ambience", track)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-faint">{needle || picked.length > 0 ? "No ambience matches." : "No ambience uploaded."}</p>
            )}
          </section>
          <section aria-label="Effects">
            <h3 className="mb-2 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Effects{" "}
              <span className="font-normal normal-case tracking-normal text-faint">
                play once{compact ? "" : <span className="hidden sm:inline"> · keys 1–9</span>}
              </span>
            </h3>
            {effects.length ? (
              <div className={`grid gap-2 ${grid}`}>
                {effects.map((track, index) => (
                  <SoundButton
                    key={track.id}
                    track={track}
                    kind="sfx"
                    active={false}
                    busy={pending === track.id}
                    disabled={disabled}
                    hotkey={!compact && index < 9 ? String(index + 1) : undefined}
                    tags={compact ? undefined : tagsOf(track)}
                    onEditTags={compact ? undefined : () => setEditingTags({ ref: bucketRef(track.id), title: track.title, tags: tagsOf(track) })}
                    onClick={() => trigger("sfx", track)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-faint">{needle || picked.length > 0 ? "No effects match." : "No effects uploaded."}</p>
            )}
          </section>
        </>
      )}
      <TagDialog target={editingTags} suggestions={allTagNames} onClose={() => setEditingTags(null)} />
    </div>
  );
}
