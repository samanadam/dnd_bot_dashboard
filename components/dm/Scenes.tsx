"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clapperboard, Music2, Play, Plus, Save, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { CampaignSelect } from "@/components/CampaignSelect";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Providers";
import { Button, EmptyState, Field, inputClass, Notice, Skeleton } from "@/components/ui";
import { bot, BotError } from "@/lib/bot/client";
import { keys, useLibrary, useMusicState, useSoundboard } from "@/lib/bot/useBotState";
import { useCampaignSelection } from "@/lib/campaign/useSelection";
import { dm, DmError } from "@/lib/dm/client";
import { useSaved } from "@/lib/dm/useSaved";
import { isTrackLink, isWebSource, trackUrl, WEB_SOURCES } from "@/lib/webAudio";
import type { Scene, SceneInput } from "@/lib/dm/scenes";
import { useVoiceTarget } from "./Soundboard";

type Draft = { id: string | null; input: SceneInput };

const blank = (campaignId: string | null): SceneInput => ({ name: "", category: "", replace: true, music: null, layers: [], campaignId });

function errorText(error: unknown, fallback: string) {
  return error instanceof BotError || error instanceof DmError ? error.message : fallback;
}

function Volume({ label, value, onChange }: { label: string; value: number; onChange: (next: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      <span className="sr-only">{label}</span>
      <input type="range" min={0} max={2} step={0.05} value={value} className="h-1 w-24 accent-[var(--accent)]" onChange={(event) => onChange(Number(event.target.value))} />
      <span className="w-9 text-right font-mono tabular-nums">{Math.round(value * 100)}%</span>
    </label>
  );
}

function Editor({ draft, categories, onCancel, onSaved }: { draft: Draft; categories: string[]; onCancel: () => void; onSaved: () => void }) {
  const toast = useToast();
  const board = useSoundboard();
  const library = useLibrary("");
  const saved = useSaved(null);
  const [input, setInput] = useState(draft.input);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<SceneInput>) => setInput((current) => ({ ...current, ...patch }));

  async function save() {
    setBusy(true);
    try {
      if (draft.id) await dm.updateScene(draft.id, input);
      else await dm.createScene(input);
      toast("ok", "Scene saved.");
      onSaved();
    } catch (error) {
      toast("danger", errorText(error, "Could not save the scene."));
      setBusy(false);
    }
  }

  const layerCount = input.layers.length;
  const savedMusic = (saved.data ?? []).filter((item) => item.kind === "music");
  const savedSounds = (kind: "ambience" | "sfx") => (saved.data ?? []).filter((item) => item.kind === kind);
  return (
    <form
      className="space-y-4 rounded-3xl border border-accent/40 bg-surface p-4 shadow-card sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (input.name.trim()) void save();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Scene name">
          <input className={inputClass} value={input.name} maxLength={60} required placeholder="Rainy tavern" onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Category" hint="Scenes with the same category are grouped.">
          <input className={inputClass} value={input.category} maxLength={40} list="scene-categories" placeholder="Taverns" onChange={(e) => set({ category: e.target.value })} />
          <datalist id="scene-categories">
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </Field>
        <Field label="Campaign">
          <CampaignSelect label="Campaign" noneLabel="Any campaign" value={input.campaignId ?? null} onChange={(next) => set({ campaignId: next })} />
        </Field>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted">Music</p>
        {input.music ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface-2 px-3 py-2">
            <Music2 className="size-4 text-accent" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{input.music.title}</span>
            <Volume label="Music volume" value={input.music.volume ?? 1} onChange={(volume) => set({ music: input.music ? { ...input.music, volume } : null })} />
            <Button size="icon" variant="ghost" aria-label="Remove music" onClick={() => set({ music: null })} icon={X} />
          </div>
        ) : (
          <select
            aria-label="Add music"
            className={`${inputClass} h-10`}
            value=""
            onChange={(event) => {
              const value = event.target.value;
              const link = savedMusic.find((item) => `yt:${item.id}` === value);
              if (link) {
                set({ music: { source: link.source, id: trackUrl(link.source, link.ref), title: link.title, volume: null } });
                return;
              }
              const track = library.data?.find((item) => item.id === value);
              if (track) set({ music: { source: track.source, id: track.id, title: track.title, volume: null } });
            }}
          >
            <option value="">{library.isPending ? "Loading the library" : "No music: pick a track"}</option>
            {(library.data ?? []).map((track) => (
              <option key={track.id} value={track.id}>
                {track.title}
              </option>
            ))}
            {savedMusic.length ? (
              <optgroup label="Saved links">
                {savedMusic.map((item) => (
                  <option key={item.id} value={`yt:${item.id}`}>
                    {item.title}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted">
          Sounds <span className="font-normal">({layerCount}/12)</span>
        </p>
        {input.layers.length ? (
          <ul className="space-y-2">
            {input.layers.map((layer, index) => (
              <li key={`${layer.kind}:${layer.id}:${index}`} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface-2 px-3 py-2">
                <span className="rounded-full border border-border px-2 py-px text-[11px] text-muted">{layer.kind === "ambience" ? "Loops" : "Once"}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{layer.title}</span>
                <Volume
                  label={`Volume for ${layer.title}`}
                  value={layer.volume}
                  onChange={(volume) => set({ layers: input.layers.map((item, i) => (i === index ? { ...item, volume } : item)) })}
                />
                <Button size="icon" variant="ghost" aria-label={`Remove ${layer.title}`} icon={X} onClick={() => set({ layers: input.layers.filter((_, i) => i !== index) })} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-faint">No sounds yet.</p>
        )}
        {layerCount < 12 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {(["ambience", "sfx"] as const).map((kind) => (
              <select
                key={kind}
                aria-label={kind === "ambience" ? "Add ambience" : "Add an effect"}
                className={`${inputClass} h-10`}
                value=""
                onChange={(event) => {
                  const value = event.target.value;
                  const link = savedSounds(kind).find((item) => `yt:${item.id}` === value);
                  if (link) {
                    set({ layers: [...input.layers, { kind, id: trackUrl(link.source, link.ref), title: link.title, volume: 1, source: link.source }] });
                    return;
                  }
                  const track = (kind === "ambience" ? board.data?.ambience : board.data?.sfx)?.find((item) => item.id === value);
                  if (track) set({ layers: [...input.layers, { kind, id: track.id, title: track.title, volume: 1 }] });
                }}
              >
                <option value="">{kind === "ambience" ? "Add ambience (loops)" : "Add an effect (plays once)"}</option>
                {(kind === "ambience" ? board.data?.ambience : board.data?.sfx)?.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.title}
                  </option>
                ))}
                {savedSounds(kind).length ? (
                  <optgroup label="Saved links">
                    {savedSounds(kind).map((item) => (
                      <option key={item.id} value={`yt:${item.id}`}>
                        {item.title}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            ))}
          </div>
        ) : null}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={input.replace} onChange={(event) => set({ replace: event.target.checked })} />
        Stop the sounds already playing first
      </label>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" icon={Save} busy={busy} disabled={!input.name.trim() || (!input.music && input.layers.length === 0)}>
          Save scene
        </Button>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Saved combinations of music and sounds, run with one tap. */
export function Scenes() {
  const toast = useToast();
  const client = useQueryClient();
  const [selection] = useCampaignSelection();
  const voice = useVoiceTarget();
  const music = useMusicState();
  const board = useSoundboard();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Scene | null>(null);

  const scenes = useQuery({ queryKey: ["dm", "scenes", selection], queryFn: () => dm.listScenes(selection ?? undefined) });
  const list = useMemo(() => scenes.data ?? [], [scenes.data]);
  const groups = useMemo(() => {
    const byCategory = new Map<string, Scene[]>();
    for (const scene of list) byCategory.set(scene.category, [...(byCategory.get(scene.category) ?? []), scene]);
    return [...byCategory.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  }, [list]);
  const categories = useMemo(() => [...new Set(list.map((scene) => scene.category).filter(Boolean))], [list]);
  const campaignForNew = selection && selection !== "unassigned" ? selection : null;

  const sourceOf = (link: string) => {
    const source = WEB_SOURCES.find((name) => isTrackLink(name, link));
    return source ? { source } : {};
  };

  function fromNow() {
    const now = blank(campaignForNew);
    const current = music.data?.current;
    if (current) now.music = { source: current.source, id: current.id, title: current.title, volume: music.data?.volume ?? null };
    now.layers = (board.data?.layers ?? []).slice(0, 12).map((layer) => ({
      kind: layer.kind,
      id: layer.track_id,
      title: layer.title,
      volume: layer.volume,
      // The bot reports a web sound by its link; a bucket sound by its key.
      ...sourceOf(layer.track_id),
    }));
    setDraft({ id: null, input: now });
  }

  async function run(scene: Scene) {
    const channel = voice.channelId ? { channel_id: voice.channelId } : {};
    setRunning(scene.id);
    let step = "starting";
    try {
      if (scene.replace) {
        step = "stopping the current sounds";
        await bot.stopSound({});
      }
      if (scene.music) {
        step = `starting ${scene.music.title}`;
        await bot.play({ source: scene.music.source, id: scene.music.id, position: "now", ...channel });
        if (scene.music.volume !== null) await bot.volume(scene.music.volume);
      }
      for (const layer of scene.layers) {
        step = `starting ${layer.title}`;
        await bot.playSound({ kind: layer.kind, id: layer.id, ...(isWebSource(layer.source) ? { source: layer.source } : {}), volume: layer.volume, ...channel });
      }
      toast("ok", `${scene.name} is playing.`);
    } catch (error) {
      toast("danger", `Stopped while ${step}: ${errorText(error, "the bot did not answer")}`);
    } finally {
      setRunning(null);
      void client.invalidateQueries({ queryKey: keys.music });
      void client.invalidateQueries({ queryKey: keys.soundboard });
    }
  }

  const refresh = () => void client.invalidateQueries({ queryKey: ["dm", "scenes"] });

  return (
    <section aria-label="Scenes" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
          <Clapperboard className="size-5 text-accent" aria-hidden /> Scenes
        </h2>
        {!draft ? (
          <div className="flex flex-wrap gap-2">
            <Button icon={Save} size="sm" disabled={!music.data?.current && !(board.data?.layers.length ?? 0)} onClick={fromNow}>
              Save what is playing
            </Button>
            <Button icon={Plus} size="sm" onClick={() => setDraft({ id: null, input: blank(campaignForNew) })}>
              New scene
            </Button>
          </div>
        ) : null}
      </div>

      {draft ? (
        <Editor
          key={draft.id ?? "new"}
          draft={draft}
          categories={categories}
          onCancel={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            refresh();
          }}
        />
      ) : null}

      {!voice.ready && voice.presence.kind !== "loading" ? <Notice tone="warn">Scenes play through the bot, which is not in a voice channel yet.</Notice> : null}

      {scenes.isPending ? (
        <Skeleton className="h-24" />
      ) : scenes.isError ? (
        <Notice title="Scenes unavailable">{errorText(scenes.error, "Try again in a moment.")}</Notice>
      ) : list.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border">
          <EmptyState icon={Clapperboard} title="No scenes yet">
            Start some music and sounds, then choose Save what is playing. Next time it is one tap.
          </EmptyState>
        </div>
      ) : (
        groups.map(([category, items]) => (
          <div key={category || "none"} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{category || "Other"}</h3>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((scene) => (
                <li key={scene.id} className="flex items-center gap-2 rounded-2xl border border-border bg-surface-2 p-2 pl-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{scene.name}</div>
                    <div className="truncate text-xs text-muted">
                      {[scene.music ? scene.music.title : null, scene.layers.length ? `${scene.layers.length} sound${scene.layers.length === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <Button size="sm" variant="primary" icon={Play} busy={running === scene.id} disabled={!voice.ready || running !== null} onClick={() => void run(scene)}>
                    Play
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`Edit ${scene.name}`} onClick={() => setDraft({ id: scene.id, input: { ...scene, campaignId: scene.campaignId } })}>
                    <span aria-hidden>…</span>
                  </Button>
                  <Button size="icon" variant="danger-ghost" aria-label={`Delete ${scene.name}`} icon={Trash2} onClick={() => setDeleting(scene)} />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "scene"}?`}
        confirmLabel="Delete"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await dm.deleteScene(deleting.id);
            refresh();
          } catch (error) {
            toast("danger", errorText(error, "Could not delete the scene."));
          } finally {
            setDeleting(null);
          }
        }}
      >
        <p>Only the saved arrangement is removed. Your tracks stay in the library.</p>
      </ConfirmDialog>
    </section>
  );
}
