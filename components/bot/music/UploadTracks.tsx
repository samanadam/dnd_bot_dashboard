"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CloudUpload, FileAudio, X, XCircle } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { BotError, uploadTrack } from "@/lib/bot/client";
import type { UploadFolder } from "@/lib/bot/types";
import { keys } from "@/lib/bot/useBotState";
import { formatDuration } from "@/lib/format";
import { useToast } from "../../Providers";
import { Button, Card } from "../../ui";

const MAX_MB = 150;
const EXTENSIONS = [".mp3", ".ogg", ".opus", ".flac", ".wav", ".m4a", ".aac"];

export const FOLDERS: { id: UploadFolder; label: string; hint: string }[] = [
  { id: "music", label: "Music", hint: "Tracks for the player queue." },
  { id: "ambience", label: "Ambience", hint: "Loops on the soundboard: rain, tavern, wind." },
  { id: "sfx", label: "Effects", hint: "One-shots up to 2 minutes: doors, thunder, roars." },
];

type Item = {
  key: string;
  file: File;
  folder: UploadFolder;
  status: "waiting" | "uploading" | "processing" | "done" | "failed";
  progress: number;
  message?: string;
};

function checkFile(file: File): string | null {
  const lower = file.name.toLowerCase();
  if (!EXTENSIONS.some((extension) => lower.endsWith(extension))) return `Not an audio file (${EXTENSIONS.join(", ")}).`;
  if (file.size === 0) return "The file is empty.";
  if (file.size > MAX_MB * 1_000_000) return `Larger than ${MAX_MB} MB.`;
  return null;
}

function sizeLabel(bytes: number) {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

export function UploadTracks({ defaultFolder = "music", compact = false }: { defaultFolder?: UploadFolder; compact?: boolean }) {
  const toast = useToast();
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [folder, setFolder] = useState<UploadFolder>(defaultFolder);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const running = useRef(false);
  const queue = useRef<Item[]>([]);
  const abort = useRef<AbortController | null>(null);

  const update = (key: string, patch: Partial<Item>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  async function drain() {
    if (running.current) return;
    running.current = true;
    while (queue.current.length) {
      const item = queue.current.shift()!;
      const controller = new AbortController();
      abort.current = controller;
      update(item.key, { status: "uploading", progress: 0 });
      try {
        const result = await uploadTrack(
          item.file,
          item.folder,
          (fraction) => update(item.key, { progress: fraction, status: fraction >= 1 ? "processing" : "uploading" }),
          controller.signal,
        );
        update(item.key, { status: "done", progress: 1, message: `${result.title} · ${formatDuration(result.duration_seconds)}` });
        void client.invalidateQueries({ queryKey: ["bot", "music", "library"] });
        void client.invalidateQueries({ queryKey: keys.soundboard });
      } catch (error) {
        const message = error instanceof BotError ? error.message : "Upload failed.";
        update(item.key, { status: "failed", message });
        if (!(error instanceof BotError && error.code === "aborted")) toast("danger", `${item.file.name}: ${message}`);
      }
    }
    abort.current = null;
    running.current = false;
  }

  function add(files: FileList | File[]) {
    const next: Item[] = [];
    for (const file of Array.from(files).slice(0, 20)) {
      const problem = checkFile(file);
      const item: Item = {
        key: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file,
        folder,
        status: problem ? "failed" : "waiting",
        progress: 0,
        message: problem ?? undefined,
      };
      next.push(item);
      if (!problem) queue.current.push(item);
    }
    setItems((current) => [...next, ...current].slice(0, 30));
    void drain();
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) add(event.dataTransfer.files);
  }

  const active = items.some((item) => item.status === "uploading" || item.status === "processing" || item.status === "waiting");

  return (
    <Card
      title="Upload sounds"
      subtitle={`Stored in the bot's music bucket · up to ${MAX_MB} MB each`}
      icon={CloudUpload}
      action={
        items.length > 0 && !active ? (
          <Button size="sm" variant="ghost" onClick={() => setItems([])}>
            Clear list
          </Button>
        ) : null
      }
    >
      <div className="space-y-4">
        <fieldset>
          <legend className="sr-only">Where the files go</legend>
          <div className={`grid gap-2 ${compact ? "grid-cols-3" : "sm:grid-cols-3"}`}>
            {FOLDERS.map((option) => (
              <label
                key={option.id}
                className={`cursor-pointer rounded-xl border px-3 py-2.5 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
                  folder === option.id ? "border-accent bg-accent-soft" : "border-border bg-surface-2 hover:border-border-strong"
                }`}
              >
                <input
                  type="radio"
                  name="upload-folder"
                  value={option.id}
                  checked={folder === option.id}
                  onChange={() => setFolder(option.id)}
                  className="sr-only"
                />
                <span className={`block text-sm font-medium ${folder === option.id ? "text-accent" : ""}`}>{option.label}</span>
                {!compact && <span className="mt-0.5 block text-xs text-muted">{option.hint}</span>}
              </label>
            ))}
          </div>
        </fieldset>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition ${
            dragging ? "border-accent bg-accent-soft" : "border-border bg-surface-2/50"
          }`}
        >
          <FileAudio className={`size-7 ${dragging ? "text-accent" : "text-faint"}`} aria-hidden />
          <p className="text-sm text-muted">Drop audio files here, or</p>
          <Button size="sm" variant="primary" icon={CloudUpload} onClick={() => input.current?.click()}>
            Choose files
          </Button>
          <input
            ref={input}
            id="upload-files"
            type="file"
            multiple
            accept={EXTENSIONS.join(",") + ",audio/*"}
            className="sr-only"
            onChange={(event) => {
              if (event.target.files?.length) add(event.target.files);
              event.target.value = "";
            }}
          />
          <p className="text-xs text-faint">{EXTENSIONS.join(" · ")}</p>
        </div>

        {items.length > 0 && (
          <ul className="space-y-2" aria-live="polite">
            {items.map((item) => (
              <li key={item.key} className="rounded-xl border border-border bg-surface-2/60 px-3 py-2.5">
                <div className="flex items-center gap-3">
                  {item.status === "done" ? (
                    <CheckCircle2 className="size-4 shrink-0 text-ok" aria-label="Uploaded" />
                  ) : item.status === "failed" ? (
                    <XCircle className="size-4 shrink-0 text-danger" aria-label="Failed" />
                  ) : (
                    <FileAudio className="size-4 shrink-0 text-muted" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium" title={item.file.name}>
                      {item.file.name}
                    </div>
                    <div className={`truncate text-xs ${item.status === "failed" ? "text-danger" : "text-muted"}`}>
                      {FOLDERS.find((f) => f.id === item.folder)?.label} · {sizeLabel(item.file.size)}
                      {item.status === "waiting" && " · waiting"}
                      {item.status === "uploading" && ` · ${Math.round(item.progress * 100)}%`}
                      {item.status === "processing" && " · checking the file"}
                      {item.message && ` · ${item.message}`}
                    </div>
                  </div>
                  {item.status === "uploading" && (
                    <Button size="icon" variant="ghost" aria-label={`Cancel ${item.file.name}`} onClick={() => abort.current?.abort()}>
                      <X className="size-4" aria-hidden />
                    </Button>
                  )}
                </div>
                {(item.status === "uploading" || item.status === "processing") && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.progress * 100)}>
                    <div
                      className={`h-full rounded-full bg-accent transition-[width] duration-200 ${item.status === "processing" ? "animate-pulse" : ""}`}
                      style={{ width: `${Math.max(3, item.progress * 100)}%` }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
