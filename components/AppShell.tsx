"use client";

import { Dices, Home, Settings, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Tool } from "@/lib/tools/registry";
import { ICON_BY_NAME } from "./icons";
import { PresenceDot } from "./bot/LivePresence";

const ICONS = ICON_BY_NAME;

function ToolIcon({ name, className }: { name: Tool["icon"]; className: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} aria-hidden />;
}

type User = { name: string | null; image: string | null };

function isActive(pathname: string, href: string) {
  return href === "/" || href === "/bot" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-accent-fg shadow-[0_8px_24px_-8px_var(--accent)]">
        <Dices className="size-5" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold">Portal</span>
        <span className="block text-[11px] text-muted">Campaign control room</span>
      </span>
    </Link>
  );
}

function Avatar({ user, size = 8 }: { user: User; size?: 8 | 9 }) {
  const cls = size === 9 ? "size-9" : "size-8";
  if (user.image) {
    // eslint-disable-next-line @next/next/no-img-element -- Discord CDN avatar, allowed by CSP
    return <img src={user.image} alt="" className={`${cls} rounded-full border border-border`} referrerPolicy="no-referrer" />;
  }
  return (
    <span className={`${cls} grid place-items-center rounded-full bg-surface-3 text-xs font-semibold`}>
      {(user.name ?? "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

export function AppShell({
  tools,
  user,
  signOut,
  children,
}: {
  tools: Tool[];
  user: User;
  signOut: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const bot = tools.find((tool) => tool.id === "bot");
  // Mobile bottom tabs follow the tool the user is in.
  const current = tools.find((tool) => tool.status === "live" && tool.links.length > 1 && (pathname === tool.href || pathname.startsWith(`${tool.href}/`)));

  return (
    <div className="min-h-dvh lg:pl-72">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-border bg-surface/70 backdrop-blur-xl lg:flex">
        <div className="px-5 py-5">
          <Brand />
        </div>
        <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
          <div>
            <NavItem href="/" icon={Home} label="Home" active={pathname === "/"} />
          </div>
          <div>
            <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Tools</div>
            {tools.map((tool) => (
              <div key={tool.id} className="mb-2">
                {tool.status === "live" ? (
                  <>
                    <div className="flex items-center justify-between px-3 py-1.5">
                      <Link href={tool.href} className="flex items-center gap-2 text-sm font-medium hover:text-accent">
                        <ToolIcon name={tool.icon} className="size-4 text-muted" />
                        {tool.name}
                      </Link>
                      {tool.id === "bot" && <PresenceDot />}
                    </div>
                    <div className="ml-5 mt-1 space-y-0.5 border-l border-border pl-3">
                      {tool.links.map((link) => (
                        <NavItem key={link.href} href={link.href} icon={ICONS[link.icon]} label={link.label} active={isActive(pathname, link.href)} />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-faint">
                    <ToolIcon name={tool.icon} className="size-4" />
                    {tool.name}
                    <span className="ml-auto rounded-full border border-border px-1.5 text-[10px]">Soon</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </nav>
        <div className="space-y-3 border-t border-border p-4">
          <NavItem href="/settings" icon={Settings} label="Settings" active={pathname === "/settings"} />
          <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-2.5">
            <Avatar user={user} size={9} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user.name ?? "Signed in"}</div>
              <div className="text-[11px] text-muted">Admin</div>
            </div>
            {signOut}
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <Brand />
          <div className="flex items-center gap-2">
            {bot && <PresenceDot />}
            <MobileMenu user={user} signOut={signOut} />
          </div>
        </div>
      </header>

      <main className={`mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10 ${current ? "pb-28 lg:pb-10" : ""}`}>{children}</main>

      {/* Mobile bottom tabs for the current tool */}
      {current && (
        <nav
          aria-label={current.name}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
        >
          <div className={`mx-auto grid max-w-md ${current.links.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
            {current.links.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${active ? "text-accent" : "text-muted"}`}
                >
                  <span className={`grid h-7 w-12 place-items-center rounded-full transition ${active ? "bg-accent-soft" : ""}`}>
                    <ToolIcon name={link.icon} className="size-5" />
                  </span>
                  {link.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

function NavItem({ href, icon: Icon, label, active }: { href: string; icon: LucideIcon; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
        active ? "bg-accent-soft font-medium text-text" : "text-muted hover:bg-surface-2 hover:text-text"
      }`}
    >
      <Icon className={`size-4 ${active ? "text-accent" : ""}`} aria-hidden />
      {label}
    </Link>
  );
}

function MobileMenu({ user, signOut }: { user: User; signOut: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const [lastPath, setLastPath] = useState(pathname);

  // Close when navigating.
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} aria-label="Account and theme" onClick={() => setOpen((v) => !v)} className="rounded-full">
        {open ? (
          <span className="grid size-8 place-items-center rounded-full bg-surface-2">
            <X className="size-4" aria-hidden />
          </span>
        ) : (
          <Avatar user={user} />
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 w-72 space-y-3 rounded-2xl border border-border bg-surface p-3 shadow-card">
          <div className="flex items-center gap-3 px-1">
            <Avatar user={user} size={9} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user.name ?? "Signed in"}</div>
              <div className="text-[11px] text-muted">Admin</div>
            </div>
            {signOut}
          </div>
          <Link
            href="/settings"
            className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm font-medium hover:bg-surface-3"
          >
            <Settings className="size-4 text-muted" aria-hidden />
            Settings and themes
          </Link>
        </div>
      )}
    </div>
  );
}
