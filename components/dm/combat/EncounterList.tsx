"use client";

import { ChevronRight, Plus, Swords, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Providers";
import { Button, EmptyState, inputClass } from "@/components/ui";
import { dm, DmError } from "@/lib/dm/client";
import type { EncounterSummary } from "@/lib/dm/encounters";

export function EncounterList({ encounters }: { encounters: EncounterSummary[] }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<EncounterSummary | null>(null);

  async function create() {
    const clean = name.trim();
    if (!clean) return;
    setBusy(true);
    try {
      const created = await dm.createEncounter(clean);
      router.push(`/dm/combat/${created.id}`);
    } catch (error) {
      toast("danger", error instanceof DmError ? error.message : "Could not create the encounter.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        className="flex flex-col gap-2 rounded-3xl border border-border bg-surface p-4 shadow-card sm:flex-row sm:items-center sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <label htmlFor="encounter-new" className="sr-only">
          New encounter name
        </label>
        <input
          id="encounter-new"
          className={`${inputClass} min-w-0 flex-1`}
          placeholder="Name the fight, e.g. Cragmaw ambush"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" variant="primary" icon={Plus} busy={busy} disabled={!name.trim()}>
          New encounter
        </Button>
      </form>

      {encounters.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border py-8">
          <EmptyState icon={Swords} title="No encounters yet">
            Prepare fights ahead of the session, or start one when the dice come out.
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {encounters.map((encounter) => (
            <li key={encounter.id} className="group relative flex items-center gap-4 rounded-3xl border border-border bg-surface p-4 shadow-card transition hover:border-accent/50">
              <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${encounter.round ? "bg-accent-soft text-accent" : "bg-surface-2 text-faint"}`}>
                <Swords className="size-5" aria-hidden />
              </span>
              <Link href={`/dm/combat/${encounter.id}`} className="min-w-0 flex-1 after:absolute after:inset-0 after:rounded-3xl">
                <span className="block truncate font-display text-xl font-semibold group-hover:text-accent">{encounter.name}</span>
                <span className="block text-xs text-muted">
                  {encounter.combatants} combatant{encounter.combatants === 1 ? "" : "s"} · {encounter.round ? `in progress, round ${encounter.round}` : "ready"}
                </span>
              </Link>
              <Button
                size="icon"
                variant="danger-ghost"
                className="relative z-10 size-9"
                icon={Trash2}
                aria-label={`Delete ${encounter.name}`}
                onClick={() => setDeleting(encounter)}
              />
              <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "encounter"}?`}
        confirmLabel="Delete"
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          try {
            await dm.deleteEncounter(deleting.id);
            toast("ok", "Encounter deleted.");
            router.refresh();
          } catch (error) {
            toast("danger", error instanceof DmError ? error.message : "Could not delete.");
          } finally {
            setBusy(false);
            setDeleting(null);
          }
        }}
      >
        <p>The initiative order, hit points and conditions are removed. Monsters in your bestiary are not affected.</p>
      </ConfirmDialog>
    </div>
  );
}
