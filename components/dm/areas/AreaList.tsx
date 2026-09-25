"use client";

import { ArrowDown, ArrowUp, Gem, MapPin, Plus, Swords, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Providers";
import { Badge, Button, EmptyState, inputClass } from "@/components/ui";
import { useCampaignSelection } from "@/lib/campaign/useSelection";
import type { AreaSummary } from "@/lib/dm/areas";
import { dm, DmError } from "@/lib/dm/client";

export function AreaList({ areas }: { areas: AreaSummary[] }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<AreaSummary | null>(null);
  // New areas start in the campaign being looked at.
  const [picked] = useCampaignSelection();

  async function create() {
    const clean = name.trim();
    if (!clean) return;
    setBusy(true);
    try {
      const created = await dm.createArea({ name: clean, summary: "", notes: "", campaignId: picked && picked !== "unassigned" ? picked : null });
      router.push(`/dm/areas/${created.area.id}`);
    } catch (error) {
      toast("danger", error instanceof DmError ? error.message : "Could not create the area.");
      setBusy(false);
    }
  }

  async function move(index: number, by: -1 | 1) {
    const ids = areas.map((area) => area.id);
    const target = index + by;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await dm.reorderAreas(ids);
      router.refresh();
    } catch (error) {
      toast("danger", error instanceof DmError ? error.message : "Could not reorder.");
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
        <label htmlFor="area-new" className="sr-only">
          New area name
        </label>
        <input id="area-new" className={`${inputClass} min-w-0 flex-1`} placeholder="Name a place, e.g. Cragmaw Hideout" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        <Button type="submit" variant="primary" icon={Plus} busy={busy} disabled={!name.trim()}>
          New area
        </Button>
      </form>

      {areas.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border py-8">
          <EmptyState icon={MapPin} title="No areas yet">
            An area is a place in your campaign: the battles that can happen there and what the party can win.
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {areas.map((area, index) => {
            const complete = area.rewardsTotal > 0 && area.rewardsDone === area.rewardsTotal;
            return (
              <li key={area.id} className="group relative flex items-center gap-4 rounded-3xl border border-border bg-surface p-4 shadow-card transition hover:border-accent/50">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
                  <MapPin className="size-5" aria-hidden />
                </span>
                <Link href={`/dm/areas/${area.id}`} className="min-w-0 flex-1 after:absolute after:inset-0 after:rounded-3xl">
                  <span className="block truncate font-display text-xl font-semibold group-hover:text-accent">{area.name}</span>
                  {area.summary ? <span className="line-clamp-1 text-xs text-muted">{area.summary}</span> : null}
                  <span className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge>
                      <Swords className="size-3" aria-hidden /> {area.battles} battle{area.battles === 1 ? "" : "s"}
                    </Badge>
                    <Badge tone={complete ? "ok" : "neutral"}>
                      <Gem className="size-3" aria-hidden /> {area.rewardsDone}/{area.rewardsTotal} rewards
                    </Badge>
                  </span>
                </Link>
                <span className="relative z-10 flex flex-col">
                  <Button size="icon" variant="ghost" className="size-7" icon={ArrowUp} aria-label={`Move ${area.name} up`} disabled={index === 0} onClick={() => void move(index, -1)} />
                  <Button size="icon" variant="ghost" className="size-7" icon={ArrowDown} aria-label={`Move ${area.name} down`} disabled={index === areas.length - 1} onClick={() => void move(index, 1)} />
                </span>
                <Button size="icon" variant="danger-ghost" className="relative z-10 size-9" icon={Trash2} aria-label={`Delete ${area.name}`} onClick={() => setDeleting(area)} />
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "area"}?`}
        confirmLabel="Delete"
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          try {
            await dm.deleteArea(deleting.id);
            toast("ok", "Area deleted.");
            router.refresh();
          } catch (error) {
            toast("danger", error instanceof DmError ? error.message : "Could not delete.");
          } finally {
            setBusy(false);
            setDeleting(null);
          }
        }}
      >
        <p>The area, its links to battles and its rewards are removed. The encounters and items themselves are not affected.</p>
      </ConfirmDialog>
    </div>
  );
}
