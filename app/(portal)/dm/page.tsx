import { BookOpen, ChevronRight, Dices, Plus, Swords, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DmHeader, LinkButton } from "@/components/dm/DmHeader";
import { requireDm } from "@/lib/dm/access";
import { CreatureRepo } from "@/lib/dm/creatures";
import { getDatabase } from "@/lib/dm/database";
import { EncounterRepo } from "@/lib/dm/encounters";
import { listSrd } from "@/lib/dm/srd";

export const metadata: Metadata = { title: "DM Screen" };
export const dynamic = "force-dynamic";

function relative(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export default async function DmHome() {
  await requireDm();
  const db = getDatabase();
  const creatures = new CreatureRepo(db).list();
  const encounters = new EncounterRepo(db).list();
  const npcs = creatures.filter((c) => c.kind === "npc").length;
  const mine = creatures.length - npcs;

  const tiles = [
    { href: "/dm/combat", icon: Swords, title: "Combat", body: "Initiative, turns, hit points and conditions.", stat: `${encounters.length} encounter${encounters.length === 1 ? "" : "s"}` },
    { href: "/dm/bestiary", icon: BookOpen, title: "Bestiary", body: "Every SRD monster plus the ones you add from your books.", stat: `${listSrd().length + mine} monsters` },
    { href: "/dm/npcs", icon: Users, title: "NPCs", body: "The people of your world, with stat blocks and secrets.", stat: `${npcs} NPC${npcs === 1 ? "" : "s"}` },
    { href: "/dm/dice", icon: Dices, title: "Dice", body: "Roll anything and send the result to Discord.", stat: "d4 to d100" },
  ];

  return (
    <div className="space-y-8">
      <DmHeader
        eyebrow="Only visible to you"
        title="DM Screen"
        description="Everything you need behind the screen: monsters, NPCs, the initiative order and your dice."
        action={
          <>
            <LinkButton href="/dm/creatures/new" icon={Plus}>
              New monster
            </LinkButton>
            <LinkButton href="/dm/combat" icon={Swords} variant="primary">
              Run combat
            </LinkButton>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(({ href, icon: Icon, title, body, stat }) => (
          <Link
            key={href}
            href={href}
            className="group relative flex flex-col gap-4 overflow-hidden rounded-3xl border border-border bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:border-accent/50"
          >
            <span className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent">
              <Icon className="size-5" aria-hidden />
            </span>
            <span>
              <span className="flex items-center justify-between font-display text-xl font-semibold">
                {title}
                <ChevronRight className="size-4 text-faint transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
              </span>
              <span className="mt-1 block text-sm text-muted">{body}</span>
            </span>
            <span className="mt-auto text-xs font-medium tabular-nums text-faint">{stat}</span>
          </Link>
        ))}
      </div>

      {encounters.length ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted">Recent encounters</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
            {encounters.slice(0, 5).map((encounter) => (
              <li key={encounter.id}>
                <Link href={`/dm/combat/${encounter.id}`} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-surface-2">
                  <Swords className="size-4 shrink-0 text-faint" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{encounter.name}</span>
                    <span className="block text-xs text-muted">
                      {encounter.combatants} combatant{encounter.combatants === 1 ? "" : "s"} · {encounter.round ? `round ${encounter.round}` : "not started"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-faint">{relative(encounter.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
