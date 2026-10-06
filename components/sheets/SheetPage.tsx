"use client";

import { useQuery } from "@tanstack/react-query";
import { BedDouble, ChevronLeft, Coffee, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PortalLink } from "@/components/PortalLink";
import { useToast } from "@/components/Providers";
import { Badge, Button, Notice, inputBaseClass } from "@/components/ui";
import { inDemo, withBase } from "@/lib/demo/base";
import { DmError } from "@/lib/dm/client";
import type { SheetView } from "@/lib/sheets/access";
import { sheets } from "@/lib/sheets/client";
import { ActionsTab } from "./ActionsTab";
import { TextArea } from "./bits";
import { FeaturesTab } from "./FeaturesTab";
import { InventoryTab } from "./InventoryTab";
import { MainTab } from "./MainTab";
import { Portrait } from "./Portrait";
import { RollProvider } from "./Roller";
import { SpellsTab } from "./SpellsTab";
import { CompanionsTab, StoryTab } from "./StoryTab";
import { useSheet, type SheetHandle } from "./useSheet";
import { VitalsBar } from "./VitalsBar";

const TABS = [
  { id: "main", label: "Main" },
  { id: "actions", label: "Actions" },
  { id: "spells", label: "Spells" },
  { id: "inventory", label: "Inventory" },
  { id: "features", label: "Features" },
  { id: "companions", label: "Companions" },
  { id: "story", label: "Story" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const STATUS_TEXT = { saved: "Saved", pending: "Unsaved changes", saving: "Saving…", offline: "Not saved, retrying", conflict: "Changed elsewhere" } as const;

function Rests({ sheet }: { sheet: SheetHandle }) {
  const [which, setWhich] = useState<"short" | "long" | null>(null);
  const [dice, setDice] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const { derived, apply } = sheet;
  return (
    <>
      <Button size="sm" icon={Coffee} onClick={() => setWhich("short")}>
        Short rest
      </Button>
      <Button size="sm" icon={BedDouble} onClick={() => setWhich("long")}>
        Long rest
      </Button>
      <ConfirmDialog
        open={which !== null}
        tone="primary"
        title={which === "long" ? "Take a long rest?" : "Take a short rest?"}
        confirmLabel="Rest"
        busy={busy}
        onClose={() => setWhich(null)}
        onConfirm={async () => {
          setBusy(true);
          await apply([which === "long" ? { op: "longRest" } : { op: "shortRest", hitDice: dice }]);
          setBusy(false);
          setWhich(null);
          setDice({});
        }}
      >
        {which === "long" ? (
          <p>Hit points, spell slots and most resources come back, some hit dice return and exhaustion drops by one.</p>
        ) : (
          <div className="space-y-2">
            <p>Pact Magic and short-rest resources come back. Spend hit dice to heal:</p>
            {derived.hitDice.map((pool) => (
              <label key={pool.die} className="flex items-center gap-2 text-sm">
                d{pool.die}
                <input
                  type="number"
                  min={0}
                  max={pool.left}
                  className={`${inputBaseClass} h-9 w-20`}
                  value={dice[pool.die] ?? 0}
                  onChange={(event) => setDice({ ...dice, [pool.die]: Math.max(0, Math.min(pool.left, Math.trunc(Number(event.target.value)) || 0)) })}
                />
                <span className="text-muted">of {pool.left}</span>
              </label>
            ))}
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}

function ManagerPanel({ sheet, onDeleted }: { sheet: SheetHandle; onDeleted: () => void }) {
  const toast = useToast();
  const { view, setView } = sheet;
  const players = useQuery({ queryKey: ["sheet-players", view.campaignId], queryFn: () => sheets.players(view.campaignId), staleTime: 60_000 });
  const [notes, setNotes] = useState(view.dmNotes ?? "");
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const change = async (patch: Parameters<typeof sheets.meta>[1]) => {
    try {
      setView(await sheets.meta(view.id, patch));
    } catch (error) {
      toast("danger", error instanceof DmError ? error.message : "Could not change that.");
    }
  };
  return (
    <div className="space-y-3 rounded-3xl border border-warn/30 bg-warn/5 p-4">
      <p className="text-xs font-semibold uppercase text-warn">DM only</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-xs text-muted">
          Player
          <select
            className={`${inputBaseClass} mt-1 h-10 min-w-48`}
            value={view.owner?.userId ?? ""}
            onChange={(event) => void change({ ownerUserId: event.target.value || null })}
          >
            <option value="">Nobody yet</option>
            {(players.data ?? []).map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.name}
              </option>
            ))}
            {view.owner?.userId && !(players.data ?? []).some((p) => p.userId === view.owner?.userId) ? <option value={view.owner.userId}>{view.owner.name}</option> : null}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2.5 text-sm">
          <input type="checkbox" className="accent-[var(--accent)]" checked={view.active} disabled={!view.owner} onChange={(event) => void change({ active: event.target.checked })} />
          In play (used by combat and the bot)
        </label>
        <label className="block text-xs text-muted">
          Status
          <select className={`${inputBaseClass} mt-1 h-10`} value={view.status} onChange={(event) => void change({ status: event.target.value as SheetView["status"] })}>
            <option value="active">Active</option>
            <option value="retired">Retired</option>
            <option value="dead">Dead</option>
          </select>
        </label>
        {view.nameSync === "pending" ? (
          <Button size="sm" icon={RefreshCw} onClick={async () => setView({ ...view, nameSync: (await sheets.nameSync(view.id)).nameSync })}>
            Retry bot name
          </Button>
        ) : null}
        <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => setDeleting(true)}>
          Delete sheet
        </Button>
      </div>
      <TextArea label="DM notes (the player never sees these)" value={notes} max={20_000} onChange={setNotes} rows={3} />
      {notes !== (view.dmNotes ?? "") ? (
        <Button size="sm" onClick={() => void change({ dmNotes: notes })}>
          Save notes
        </Button>
      ) : null}
      {view.nameSync === "pending" ? <Notice tone="warn">The bot has not taken this character&apos;s name yet. Transcripts use the old name until it does.</Notice> : null}
      <ConfirmDialog
        open={deleting}
        title={`Delete ${view.name}?`}
        confirmLabel="Delete forever"
        requireText="delete"
        busy={busy}
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await sheets.remove(view.id);
            onDeleted();
          } catch (error) {
            toast("danger", error instanceof DmError ? error.message : "Could not delete.");
          } finally {
            setBusy(false);
            setDeleting(false);
          }
        }}
      >
        <p>The sheet and everything on it is gone for good. Retiring keeps it instead.</p>
      </ConfirmDialog>
    </div>
  );
}

/** A whole character sheet, for its player or for the DM. */
export function SheetPage({ initial, backHref, otherCampaigns = [] }: { initial: SheetView; backHref: string; otherCampaigns?: { id: string; name: string }[] }) {
  const sheet = useSheet(initial);
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("main");
  const [editing, setEditing] = useState(false);
  const { view, body, status, conflict, acceptTheirs, keepMine } = sheet;
  const back = withBase(backHref, inDemo());

  return (
    <RollProvider sheetId={view.id}>
      <div className="space-y-4">
        <PortalLink href={backHref} className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
          <ChevronLeft className="size-4" aria-hidden /> Back
        </PortalLink>

        <header className="flex flex-wrap items-center gap-4">
          <Portrait sheet={sheet} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-semibold">{body.identity.name}</h1>
            <p className="text-sm text-muted">
              {[body.identity.species, body.classes.map((c) => `${c.name}${c.subclass ? ` (${c.subclass})` : ""} ${c.level}`).join(" / "), body.identity.background].filter(Boolean).join(" · ")}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge>SRD {view.edition}</Badge>
              {view.status !== "active" ? <Badge tone="warn">{view.status === "dead" ? "Dead" : "Retired"}</Badge> : null}
              {view.active ? <Badge tone="ok">In play</Badge> : null}
              {view.owner && !view.owner.you ? <Badge>{view.owner.name}</Badge> : null}
              <span className={`text-xs ${status === "saved" ? "text-faint" : status === "conflict" || status === "offline" ? "text-danger" : "text-muted"}`} aria-live="polite">
                {STATUS_TEXT[status]}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Rests sheet={sheet} />
            <Button size="sm" variant={editing ? "primary" : "secondary"} icon={Pencil} onClick={() => setEditing((v) => !v)} aria-pressed={editing}>
              {editing ? "Done editing" : "Edit"}
            </Button>
            {otherCampaigns.length ? (
              <select
                aria-label="Copy to another campaign"
                className={`${inputBaseClass} h-8 text-xs`}
                value=""
                onChange={async (event) => {
                  const target = event.target.value;
                  if (!target) return;
                  try {
                    const copy = await sheets.copy(view.id, target);
                    toast("ok", "Copied. The copy is a separate sheet.");
                    router.push(withBase(`/play/c/${target}/sheets/${copy.id}`, inDemo()));
                  } catch (error) {
                    toast("danger", error instanceof DmError ? error.message : "Could not copy.");
                  }
                }}
              >
                <option value="">Copy to…</option>
                {otherCampaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </header>

        {conflict ? (
          <Notice tone="warn" title="Someone else changed this sheet">
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" onClick={acceptTheirs}>
                Take their version
              </Button>
              <Button size="sm" variant="primary" onClick={keepMine}>
                Keep mine
              </Button>
            </div>
          </Notice>
        ) : null}

        {view.manager ? <ManagerPanel sheet={sheet} onDeleted={() => router.push(back)} /> : null}

        <VitalsBar sheet={sheet} />

        <div role="tablist" aria-label="Sheet" className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-bg/40 p-1">
          {TABS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              id={`sheet-tab-${option.id}`}
              aria-selected={tab === option.id}
              aria-controls={`sheet-panel-${option.id}`}
              onClick={() => setTab(option.id)}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition ${tab === option.id ? "bg-surface-3 text-text shadow-card" : "text-muted hover:text-text"}`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`sheet-panel-${tab}`} aria-labelledby={`sheet-tab-${tab}`}>
          {tab === "main" ? <MainTab sheet={sheet} editing={editing} /> : null}
          {tab === "actions" ? <ActionsTab sheet={sheet} editing={editing} /> : null}
          {tab === "spells" ? <SpellsTab sheet={sheet} editing={editing} campaignId={view.campaignId} /> : null}
          {tab === "inventory" ? <InventoryTab sheet={sheet} editing={editing} /> : null}
          {tab === "features" ? <FeaturesTab sheet={sheet} editing={editing} /> : null}
          {tab === "companions" ? <CompanionsTab sheet={sheet} editing={editing} /> : null}
          {tab === "story" ? <StoryTab sheet={sheet} editing={editing} /> : null}
        </div>
      </div>
    </RollProvider>
  );
}
