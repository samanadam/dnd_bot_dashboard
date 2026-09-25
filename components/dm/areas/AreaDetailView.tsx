"use client";

import { Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CampaignSelect } from "@/components/CampaignSelect";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Providers";
import { Badge, Button, Field, inputBaseClass, inputClass } from "@/components/ui";
import { useCampaignSelection } from "@/lib/campaign/useSelection";
import { dm, DmError } from "@/lib/dm/client";
import type { AreaDetail, RewardView } from "@/lib/dm/areaView";
import { DONE_STATUSES } from "@/lib/dm/rewards";
import { BattlesPanel } from "./BattlesPanel";
import { RewardsPanel } from "./RewardsPanel";

/**
 * One area: its details, the battles that can happen there and the rewards. Every
 * change is saved at once and answered with the whole area, so this component only
 * ever shows what the server holds. A "conflict" means another tab changed the
 * area first; the page then reloads it instead of overwriting.
 */
export function AreaDetailView({ initial }: { initial: AreaDetail }) {
  const router = useRouter();
  const toast = useToast();
  const [picked] = useCampaignSelection();
  const [detail, setDetail] = useState(initial);
  const [name, setName] = useState(initial.area.name);
  const [summary, setSummary] = useState(initial.area.summary);
  const [notes, setNotes] = useState(initial.area.notes);
  const [campaignId, setCampaignId] = useState(initial.area.campaignId);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { area } = detail;

  const dirty = name.trim() !== area.name || summary.trim() !== area.summary || notes !== area.notes || campaignId !== area.campaignId;

  async function run(work: () => Promise<AreaDetail>, message?: string): Promise<boolean> {
    setBusy(true);
    try {
      setDetail(await work());
      if (message) toast("ok", message);
      return true;
    } catch (error) {
      if (error instanceof DmError && error.code === "conflict") {
        toast("danger", "This area was changed in another tab. It has been reloaded; try again.");
        try {
          const fresh = await dm.getArea(area.id);
          setDetail(fresh);
          setName(fresh.area.name);
          setSummary(fresh.area.summary);
          setNotes(fresh.area.notes);
          setCampaignId(fresh.area.campaignId);
        } catch {
          // The message above is enough; a reload will show what is wrong.
        }
      } else {
        toast("danger", error instanceof DmError ? error.message : "Could not save.");
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  const done = detail.rewards.filter((reward) => DONE_STATUSES.includes(reward.status)).length;

  return (
    <div className="space-y-8">
      <form
        className="space-y-4 rounded-3xl border border-border bg-surface p-4 shadow-card sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          // The page title comes from the server, so fetch it again after a rename.
          void run(() => dm.updateArea(area.id, area.version, { name, summary, notes, campaignId }), "Area saved.").then((saved) => saved && router.refresh());
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_16rem]">
          <Field label="Name">
            <input className={inputClass} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Campaign">
            <CampaignSelect value={campaignId} onChange={setCampaignId} label="Campaign" noneLabel="Not in a campaign" />
          </Field>
        </div>
        <Field label="Summary" hint="What the party sees and hears when they arrive.">
          <textarea className={`${inputBaseClass} min-h-20 w-full py-2.5`} value={summary} maxLength={2000} onChange={(event) => setSummary(event.target.value)} />
        </Field>
        <Field label="Private notes" hint="Only you see these.">
          <textarea className={`${inputBaseClass} min-h-28 w-full py-2.5`} value={notes} maxLength={20_000} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge tone="neutral">{detail.battles.length} battle{detail.battles.length === 1 ? "" : "s"}</Badge>
            <Badge tone={detail.rewards.length && done === detail.rewards.length ? "ok" : "neutral"}>
              {done}/{detail.rewards.length} rewards
            </Badge>
          </p>
          <div className="flex gap-2">
            <Button variant="danger-ghost" icon={Trash2} onClick={() => setDeleting(true)}>
              Delete
            </Button>
            <Button type="submit" variant="primary" icon={Save} busy={busy} disabled={!dirty || !name.trim()}>
              Save
            </Button>
          </div>
        </div>
      </form>

      <BattlesPanel detail={detail} busy={busy} onReplace={(ids) => run(() => dm.setAreaEncounters(area.id, area.version, ids))} />

      <RewardsPanel
        detail={detail}
        campaign={picked}
        busy={busy}
        onReplace={(rewards) => run(() => dm.setAreaRewards(area.id, area.version, rewards))}
        onStatus={(reward: RewardView, status) => void run(() => dm.setRewardStatus(area.id, reward.id, status))}
      />

      <ConfirmDialog
        open={deleting}
        title={`Delete ${area.name}?`}
        confirmLabel="Delete"
        busy={busy}
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await dm.deleteArea(area.id);
            toast("ok", "Area deleted.");
            router.push("/dm/areas");
          } catch (error) {
            toast("danger", error instanceof DmError ? error.message : "Could not delete.");
            setBusy(false);
            setDeleting(false);
          }
        }}
      >
        <p>The area, its links to battles and its rewards are removed. The encounters and items themselves are not affected.</p>
      </ConfirmDialog>
    </div>
  );
}

