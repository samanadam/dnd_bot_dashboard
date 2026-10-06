"use client";

import type { ReactNode } from "react";
import { inputBaseClass } from "@/components/ui";

// Small building blocks shared by the sheet's tabs.

export const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export const newLocalId = () => Math.random().toString(36).slice(2, 12);

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-3xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  className = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  className?: string;
}) {
  return (
    <label className={`block text-xs text-muted ${className}`}>
      {label}
      <input
        type="number"
        inputMode="numeric"
        className={`${inputBaseClass} mt-1 h-10 w-full`}
        value={value}
        min={min}
        max={max}
        onChange={(event) => {
          const parsed = Math.trunc(Number(event.target.value));
          onChange(Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : min);
        }}
      />
    </label>
  );
}

export function TextField({ label, value, max, onChange, placeholder }: { label: string; value: string; max: number; onChange: (next: string) => void; placeholder?: string }) {
  return (
    <label className="block text-xs text-muted">
      {label}
      <input className={`${inputBaseClass} mt-1 h-10 w-full`} value={value} maxLength={max} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function TextArea({ label, value, max, onChange, rows = 4 }: { label: string; value: string; max: number; onChange: (next: string) => void; rows?: number }) {
  return (
    <label className="block text-xs text-muted">
      {label}
      <textarea className={`${inputBaseClass} mt-1 w-full py-2 text-sm text-text`} rows={rows} value={value} maxLength={max} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

/** A comma-separated list edited as one line of text. */
export function ListField({ label, value, onChange, max = 40 }: { label: string; value: string[]; onChange: (next: string[]) => void; max?: number }) {
  return (
    <TextField
      label={label}
      value={value.join(", ")}
      max={2000}
      onChange={(text) =>
        onChange(
          text
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
            .slice(0, max),
        )
      }
    />
  );
}

/** Pips for a pool: filled ones are left, empty ones are spent. Tapping one spends or restores. */
export function Pips({ total, left, label, onSpend, onRestore, disabled }: { total: number; left: number; label: string; onSpend: () => void; onRestore: () => void; disabled?: boolean }) {
  if (total <= 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`${label}: ${left} of ${total} left`}>
      {Array.from({ length: total }, (_, index) => {
        const filled = index < left;
        return (
          <button
            key={index}
            type="button"
            disabled={disabled}
            onClick={filled ? onSpend : onRestore}
            aria-label={filled ? `Use one ${label}` : `Get back one ${label}`}
            className={`size-5 rounded-full border-2 transition ${filled ? "border-accent bg-accent" : "border-border-strong bg-transparent"} disabled:opacity-50`}
          />
        );
      })}
    </div>
  );
}
