"use client";

import { Camera, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useToast } from "@/components/Providers";
import { inDemo } from "@/lib/demo/base";
import type { SheetHandle } from "./useSheet";

const MAX_BYTES = 5 * 1024 * 1024;

/** The character's picture, with upload and remove. The server re-encodes every upload. */
export function Portrait({ sheet }: { sheet: SheetHandle }) {
  const toast = useToast();
  const { view, setView, body } = sheet;
  const input = useRef<HTMLInputElement>(null);
  const [stamp, setStamp] = useState(0);
  const [busy, setBusy] = useState(false);
  const demo = inDemo();
  const initials = body.identity.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  async function upload(file: File) {
    if (file.size > MAX_BYTES) {
      toast("danger", "Pictures can be at most 5 MB.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/sheets/${encodeURIComponent(view.id)}/portrait`, {
        method: "PUT",
        headers: { "x-portal-request": "1", "Content-Type": file.type },
        body: file,
        credentials: "same-origin",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(data?.error?.message ?? "Could not upload the picture.");
      }
      setView({ ...view, hasPortrait: true });
      setStamp(Date.now());
    } catch (error) {
      toast("danger", error instanceof Error ? error.message : "Could not upload the picture.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await fetch(`/api/sheets/${encodeURIComponent(view.id)}/portrait`, { method: "DELETE", headers: { "x-portal-request": "1" }, credentials: "same-origin" });
      setView({ ...view, hasPortrait: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="group relative size-20 shrink-0">
      {view.hasPortrait && !demo ? (
        // eslint-disable-next-line @next/next/no-img-element -- a private, already-small image behind a login
        <img src={`/api/sheets/${encodeURIComponent(view.id)}/portrait?v=${stamp}`} alt={`Portrait of ${body.identity.name}`} className="size-20 rounded-2xl border border-border object-cover" />
      ) : (
        <div className="grid size-20 place-items-center rounded-2xl border border-border bg-surface-2 text-2xl font-semibold text-muted" aria-hidden>
          {initials || "?"}
        </div>
      )}
      {demo ? null : (
        <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 rounded-b-2xl bg-bg/80 py-0.5 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
          <button type="button" className="rounded p-1 hover:text-accent" aria-label="Upload a picture" disabled={busy} onClick={() => input.current?.click()}>
            <Camera className="size-4" aria-hidden />
          </button>
          {view.hasPortrait ? (
            <button type="button" className="rounded p-1 hover:text-danger" aria-label="Remove the picture" disabled={busy} onClick={() => void remove()}>
              <Trash2 className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
