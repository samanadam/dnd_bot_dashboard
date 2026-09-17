import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

// Page header for the DM Screen: a small breadcrumb, a serif title and actions.
export function DmHeader({
  eyebrow,
  title,
  description,
  back,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  back?: { href: string; label: string };
  action?: ReactNode;
}) {
  return (
    <header className="space-y-3">
      {back ? (
        <Link href={back.href} className="inline-flex items-center gap-1 text-sm text-muted transition hover:text-text">
          <ChevronLeft className="size-4" aria-hidden /> {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{eyebrow}</p> : null}
          <h1 className="mt-1 text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p> : null}
        </div>
        {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
      </div>
    </header>
  );
}

export function LinkButton({
  href,
  children,
  variant = "secondary",
  icon: Icon,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  const styles =
    variant === "primary"
      ? "bg-accent text-accent-fg shadow-[0_8px_24px_-10px_var(--accent)] hover:bg-accent-strong"
      : "border border-border bg-surface-2 text-text hover:border-border-strong hover:bg-surface-3";
  return (
    <Link href={href} className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium transition active:translate-y-px ${styles}`}>
      {Icon ? <Icon className="size-4" aria-hidden /> : null}
      {children}
    </Link>
  );
}
