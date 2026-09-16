"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./ui";

type Props = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  // When set, the user must type this text before confirming.
  requireText?: string;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmDialog({ open, title, children, confirmLabel, tone = "danger", busy, requireText, onConfirm, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-3xl border border-border bg-surface p-0 text-text shadow-2xl"
    >
      <form
        method="dialog"
        className="p-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (requireText && inputRef.current?.value.trim() !== requireText) {
            inputRef.current?.focus();
            return;
          }
          onConfirm();
        }}
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="mt-2 space-y-2 text-sm text-muted">{children}</div>
        {requireText && open && (
          <label className="mt-4 block text-sm">
            Type <code className="rounded bg-surface-2 px-1 font-mono">{requireText}</code> to confirm
            <input
              ref={inputRef}
              autoComplete="off"
              className="mt-1.5 h-11 w-full rounded-xl border border-border bg-bg px-3.5 font-mono text-sm focus:border-danger focus:outline-none focus:ring-4 focus:ring-danger/15"
            />
          </label>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose} disabled={busy}>
            Keep going
          </Button>
          <Button type="submit" variant={tone === "danger" ? "danger" : "primary"} busy={busy}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
