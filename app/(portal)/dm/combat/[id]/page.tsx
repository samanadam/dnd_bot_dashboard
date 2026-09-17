import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CombatTracker } from "@/components/dm/combat/CombatTracker";
import { SoundboardDrawer } from "@/components/dm/SoundboardDrawer";
import { requireDm } from "@/lib/dm/access";
import { CreatureRepo } from "@/lib/dm/creatures";
import { getDatabase } from "@/lib/dm/database";
import { ENCOUNTER_ID, EncounterRepo } from "@/lib/dm/encounters";
import { listSrd, summarise } from "@/lib/dm/srd";

export const metadata: Metadata = { title: "Encounter" };
export const dynamic = "force-dynamic";

export default async function EncounterPage(props: PageProps<"/dm/combat/[id]">) {
  await requireDm();
  const { id } = await props.params;
  if (!ENCOUNTER_ID.test(id)) notFound();
  const db = getDatabase();
  const stored = new EncounterRepo(db).get(id);
  if (!stored) notFound();
  const custom = new CreatureRepo(db).list().map((c) => summarise(c.id, c.id, "custom", c.kind, c.statBlock, c.tags));

  return (
    <div className="space-y-4">
      <Link href="/dm/combat" className="inline-flex items-center gap-1 text-sm text-muted transition hover:text-text">
        <ChevronLeft className="size-4" aria-hidden /> All encounters
      </Link>
      {/* Keyed by id so opening another encounter never reuses this one's local state. */}
      <CombatTracker key={stored.id} initial={stored} creatures={[...custom, ...listSrd()]} />
      <SoundboardDrawer />
    </div>
  );
}
