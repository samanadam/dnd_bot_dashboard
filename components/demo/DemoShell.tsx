"use client";

import { useQueryClient } from "@tanstack/react-query";
import { EyeOff } from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { PortalLink } from "@/components/PortalLink";
import { HubView } from "@/components/views/HubView";
import { can, type Access, type Permission } from "@/lib/access/permissions";
import { stripBase } from "@/lib/demo/base";
import { DEMO_USER } from "@/lib/demo/fixtures";
import { personaAccess, PERSONAS, useDemoPersona, type Persona } from "@/lib/demo/persona";
import { tools, visibleTools } from "@/lib/tools/registry";

/** What the real portal checks before showing a page, by path. null: any signed-in user. */
export function gateFor(pathname: string): { any: Permission[] } | "owner" | null {
  const path = stripBase(pathname);
  if (path === "/settings/access") return "owner";
  if (path.startsWith("/play")) return { any: ["play", "sheets.manage"] };
  if (path === "/dm" || path.startsWith("/dm/")) return { any: ["dm"] };
  if (path === "/bot/campaigns") return { any: ["bot.view"] };
  const links = tools.flatMap((tool) => tool.links).sort((a, b) => b.href.length - a.href.length);
  const link = links.find((l) => path === l.href || path.startsWith(`${l.href}/`));
  return link && link.href !== "/" ? { any: [link.permission] } : null;
}

export function allowed(access: Access, gate: ReturnType<typeof gateFor>) {
  if (gate === null) return true;
  if (gate === "owner") return access.owner;
  return gate.any.some((p) => can(access, p));
}

/** Pick who to look at the demo as. */
export function PersonaSwitch() {
  const [persona, setPersona] = useDemoPersona();
  const client = useQueryClient();
  return (
    <div role="radiogroup" aria-label="View the demo as" className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-surface-2 p-1 text-xs">
      <span className="px-1.5 text-muted">View as</span>
      {(Object.keys(PERSONAS) as Persona[]).map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={persona === id}
          title={PERSONAS[id].description}
          onClick={() => {
            setPersona(id);
            // Everything cached was answered for the previous persona.
            void client.resetQueries();
          }}
          className={`rounded-lg px-2.5 py-1 font-medium ${persona === id ? "bg-surface-3 text-text shadow-card" : "text-muted hover:text-text"}`}
        >
          {PERSONAS[id].label}
        </button>
      ))}
    </div>
  );
}

/** The demo's frame: the nav and pages a visitor sees match the persona's access. */
export function DemoShell({ signOut, banner, children }: { signOut: ReactNode; banner: ReactNode; children: ReactNode }) {
  const [persona] = useDemoPersona();
  const pathname = usePathname();
  const access = personaAccess(persona);
  const gate = gateFor(pathname);
  return (
    <AppShell tools={visibleTools(access)} user={{ name: DEMO_USER.name, image: null }} signOut={signOut}>
      {banner}
      {allowed(access, gate) ? (
        children
      ) : (
        <div className="mx-auto max-w-md rounded-3xl border border-border bg-surface p-8 text-center shadow-card">
          <EyeOff className="mx-auto size-6 text-muted" aria-hidden />
          <h1 className="mt-2 font-display text-xl font-semibold">Not for a {PERSONAS[persona].label.toLowerCase()}</h1>
          <p className="mt-1 text-sm text-muted">In the real portal this page answers &ldquo;not found&rdquo; to someone with this access. Switch who you are viewing as above to see it.</p>
          <PortalLink href="/" className="mt-4 inline-block text-sm font-medium text-accent hover:underline">
            Home
          </PortalLink>
        </div>
      )}
    </AppShell>
  );
}

/** The demo's home page, with the tools the persona can open. */
export function DemoHub() {
  const [persona] = useDemoPersona();
  return <HubView name={DEMO_USER.name} tools={visibleTools(personaAccess(persona))} />;
}
