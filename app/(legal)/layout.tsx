import { Dices } from "lucide-react";
import Link from "next/link";
import { CookieSettingsButton } from "@/components/consent/CookieSettingsButton";

// Public pages (see PUBLIC_PATHS in proxy.ts): anyone must be able to read the
// terms before signing in, so nothing here touches the session.

const LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/cookies", label: "Cookies" },
];

export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold">
            <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-accent-fg">
              <Dices className="size-4" aria-hidden />
            </span>
            Portal
          </Link>
          <nav aria-label="Legal" className="flex items-center gap-4 text-sm text-muted">
            {LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-text">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 pb-40 sm:px-6">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted sm:px-6">
          <span>Portal for the D&amp;D recorder bot</span>
          <CookieSettingsButton className="hover:text-text" />
        </div>
      </footer>
    </div>
  );
}
