import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DeleteCreatureButton } from "@/components/dm/DeleteCreatureButton";
import { RollableStatBlock } from "@/components/dm/DiceProvider";
import { DmHeader, LinkButton } from "@/components/dm/DmHeader";
import { requireDm } from "@/lib/dm/access";
import { CREATURE_ID, CreatureRepo } from "@/lib/dm/creatures";
import { getDatabase } from "@/lib/dm/database";

export const dynamic = "force-dynamic";

type Props = PageProps<"/dm/bestiary/custom/[id]">;

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { id } = await props.params;
  return { title: CREATURE_ID.test(id) ? (new CreatureRepo(getDatabase()).get(id)?.statBlock.name ?? "Creature") : "Creature" };
}

export default async function CustomCreaturePage(props: Props) {
  await requireDm();
  const { id } = await props.params;
  const creature = CREATURE_ID.test(id) ? new CreatureRepo(getDatabase()).get(id) : null;
  if (!creature) notFound();
  const isNpc = creature.kind === "npc";

  return (
    <div className="space-y-6">
      <DmHeader
        back={isNpc ? { href: "/dm/npcs", label: "NPCs" } : { href: "/dm/bestiary?source=custom", label: "Bestiary" }}
        eyebrow={isNpc ? "NPC" : "Your monster"}
        title={creature.statBlock.name}
        action={
          <>
            <DeleteCreatureButton id={creature.id} name={creature.statBlock.name} kind={creature.kind} />
            <LinkButton href={`/dm/creatures/${creature.id}/edit`} icon={Pencil} variant="primary">
              Edit
            </LinkButton>
          </>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-card sm:p-8">
          <RollableStatBlock block={creature.statBlock} />
        </div>
        <aside className="space-y-4 lg:sticky lg:top-6">
          <section className="rounded-3xl border border-border bg-surface p-5 shadow-card">
            <h2 className="font-display text-lg font-semibold">Notes</h2>
            {creature.notes ? (
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{creature.notes}</p>
            ) : (
              <p className="mt-2 text-sm text-faint">No notes yet.</p>
            )}
          </section>
          {creature.tags.length ? (
            <section className="rounded-3xl border border-border bg-surface p-5 shadow-card">
              <h2 className="font-display text-lg font-semibold">Tags</h2>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {creature.tags.map((tag) => (
                  <li key={tag} className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs text-muted">
                    {tag}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <p className="px-1 text-xs text-faint">
            Updated {new Date(creature.updatedAt).toISOString().slice(0, 10)}
          </p>
        </aside>
      </div>
    </div>
  );
}
