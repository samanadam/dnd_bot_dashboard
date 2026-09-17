import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { HubBotCard } from "@/components/bot/HubBotCard";
import { ICON_BY_NAME } from "@/components/icons";
import { isDm } from "@/lib/dm/isDm";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/session";
import { visibleTools } from "@/lib/tools/registry";

export const metadata: Metadata = { title: "Home" };

function greeting() {
  const hour = new Date().getHours();
  return hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function HubPage() {
  const user = await requireUser();
  const tools = visibleTools(isDm(user.id, env().DM_USER_IDS));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted">{greeting()}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
          Welcome back{user.name ? `, ${user.name}` : ""}
        </h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {tools.map((tool) => {
          if (tool.id === "bot") {
            return (
              <div key={tool.id} className="lg:col-span-2">
                <HubBotCard />
              </div>
            );
          }
          const Icon = ICON_BY_NAME[tool.icon];
          if (tool.status === "live") {
            return (
              <div key={tool.id} className="flex flex-col gap-5 rounded-3xl border border-border bg-surface p-6 shadow-card">
                <Link href={tool.href} className="group flex items-start gap-4">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 font-display text-2xl font-bold group-hover:text-accent">
                      {tool.name}
                      <ChevronRight className="size-5 text-faint transition group-hover:translate-x-0.5" aria-hidden />
                    </span>
                    <span className="mt-1 block text-sm text-muted">{tool.description}</span>
                  </span>
                </Link>
                <div className="mt-auto grid grid-cols-2 gap-2">
                  {tool.links.map((link) => {
                    const LinkIcon = ICON_BY_NAME[link.icon];
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="flex items-center gap-2 rounded-2xl border border-border bg-surface-2 px-3 py-2.5 text-sm font-medium transition hover:border-accent/50 hover:text-accent"
                      >
                        <LinkIcon className="size-4 text-muted" aria-hidden />
                        {link.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          }
          return (
            <div
              key={tool.id}
              className="flex flex-col justify-between gap-6 rounded-3xl border border-dashed border-border-strong p-6 text-muted"
            >
              <span className="grid size-12 place-items-center rounded-2xl border border-border bg-surface-2">
                <Icon className="size-6" aria-hidden />
              </span>
              <div>
                <div className="font-semibold text-text">{tool.name}</div>
                <p className="mt-1 text-sm">{tool.description}</p>
                <span className="mt-3 inline-block rounded-full border border-border px-2 py-0.5 text-[11px]">Coming soon</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
