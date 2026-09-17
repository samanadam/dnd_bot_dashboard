"use client";

import type { LucideIcon } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "danger-ghost";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-fg shadow-[0_8px_24px_-10px_var(--accent)] hover:bg-accent-strong active:translate-y-px",
  secondary: "border border-border bg-surface-2 text-text hover:border-border-strong hover:bg-surface-3",
  danger: "bg-danger text-danger-fg hover:brightness-110",
  ghost: "text-muted hover:bg-surface-2 hover:text-text",
  "danger-ghost": "text-danger hover:bg-danger/10",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: "sm" | "md" | "lg" | "icon";
    busy?: boolean;
    icon?: LucideIcon;
  }
>(function Button({ variant = "secondary", size = "md", busy, icon: Icon, className = "", children, disabled, ...props }, ref) {
  const sizes = {
    sm: "h-8 gap-1.5 px-3 text-xs",
    md: "h-10 gap-2 px-4 text-sm",
    lg: "h-12 gap-2 px-5 text-base",
    icon: "size-9 text-sm",
  };
  const iconSize = size === "lg" ? "size-5" : size === "sm" ? "size-3.5" : "size-4";
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex shrink-0 items-center justify-center rounded-xl font-medium transition disabled:pointer-events-none disabled:opacity-40 ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {busy ? (
        <span className={`${iconSize} animate-spin rounded-full border-2 border-current border-t-transparent`} aria-hidden />
      ) : (
        Icon && <Icon className={iconSize} aria-hidden />
      )}
      {children}
    </button>
  );
});

export function Card({
  title,
  icon: Icon,
  subtitle,
  action,
  children,
  className = "",
  padded = true,
}: {
  title?: ReactNode;
  icon?: LucideIcon;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`rounded-2xl border border-border bg-surface shadow-card ${className}`}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {Icon && (
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                <Icon className="size-4" aria-hidden />
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="truncate text-sm font-semibold">{title}</h2>}
              {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
            </div>
          </div>
          {action}
        </header>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

type Tone = "neutral" | "ok" | "warn" | "danger" | "accent";

const toneText: Record<Tone, string> = {
  neutral: "text-muted",
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  accent: "text-accent",
};

export function Badge({ tone = "neutral", dot, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  const tones: Record<Tone, string> = {
    neutral: "border-border bg-surface-2 text-muted",
    ok: "border-ok/25 bg-ok/10 text-ok",
    warn: "border-warn/25 bg-warn/10 text-warn",
    danger: "border-danger/25 bg-danger/10 text-danger",
    accent: "border-accent/25 bg-accent-soft text-accent",
  };
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone,
  icon: Icon,
  meter,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "ok" | "warn" | "danger";
  icon?: LucideIcon;
  // 0..1, drawn as a thin bar under the value.
  meter?: number;
}) {
  const color = tone ? toneText[tone] : "text-text";
  const bar = tone === "danger" ? "bg-danger" : tone === "warn" ? "bg-warn" : "bg-accent";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {Icon && (
          <span className={`grid size-8 place-items-center rounded-lg bg-surface-2 ${tone ? toneText[tone] : "text-muted"}`}>
            <Icon className="size-4" aria-hidden />
          </span>
        )}
      </div>
      <div className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl ${color}`}>{value}</div>
      {meter !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.round(Math.min(1, Math.max(0, meter)) * 100)}%` }} />
        </div>
      )}
      {hint && <div className="mt-2 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Notice({ tone = "danger", title, children }: { tone?: "danger" | "warn" | "neutral"; title?: string; children?: ReactNode }) {
  const tones = {
    danger: "border-danger/30 bg-danger/10",
    warn: "border-warn/30 bg-warn/10",
    neutral: "border-border bg-surface-2",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      {title && <div className="font-semibold">{title}</div>}
      {children && <div className={title ? "mt-0.5 text-muted" : ""}>{children}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-surface-2 ${className}`} aria-hidden />;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <span className="grid size-11 place-items-center rounded-2xl border border-border bg-surface-2 text-faint">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="text-sm font-medium">{title}</div>
      {children && <div className="max-w-xs text-xs text-muted">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

// Field styling without a size, for inputs that set their own height and width.
export const inputBaseClass =
  "rounded-xl border border-border bg-bg/60 px-3.5 text-sm text-text placeholder:text-faint transition focus:border-accent focus:bg-bg focus:outline-none focus:ring-4 focus:ring-accent-soft disabled:opacity-50 aria-[invalid=true]:border-danger";

export const inputClass = `h-11 w-full ${inputBaseClass}`;
