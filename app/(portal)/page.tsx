import type { Metadata } from "next";
import { HubBotCard } from "@/components/bot/HubBotCard";
import { ICON_BY_NAME } from "@/components/icons";
import { requireUser } from "@/lib/session";
import { tools } from "@/lib/tools/registry";

export const metadata: Metadata = { title: "Home" };

function greeting() {
  const hour = new Date().getHours();
  return hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function HubPage() {
  const user = await requireUser();

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
