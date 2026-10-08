"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Plus, Shield, Swords, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PortalLink } from "@/components/PortalLink";
import { useToast } from "@/components/Providers";
import { SheetPage } from "@/components/sheets/SheetPage";
import { Badge, Button, EmptyState, Notice, PageHeader, inputBaseClass, inputClass } from "@/components/ui";
import { inDemo, withBase } from "@/lib/demo/base";
import { DmError } from "@/lib/dm/client";
import type { SheetSummary, SheetView } from "@/lib/sheets/access";
import { sheets } from "@/lib/sheets/client";

/**
 * A campaign's sheets: a player's own, or every one for whoever manages them.
 * `base` is where sheets open: /play/c/<campaign>/sheets or /dm/party.
 */
export function SheetListView({
  campaign,
  initial,
  manager,
  base,
  battleHref,
}: {
  campaign: { id: string; name: string };
  initial?: SheetSummary[];
  manager: boolean;
  base: string;
  battleHref?: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const client = useQueryClient();
  const list = useQuery({ queryKey: ["sheets", campaign.id], queryFn: () => sheets.list(campaign.id), initialData: initial, refetchInterval: 15_000 });
  const players = useQuery({ queryKey: ["sheet-players", campaign.id], queryFn: () => sheets.players(campaign.id), enabled: manager, staleTime: 60_000 });
  const [name, setName] = useState("");
  const [edition, setEdition] = useState<"2014" | "2024">("2024");
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const sheet = await sheets.create({ campaignId: campaign.id, name: name.trim(), edition, ...(manager ? { ownerUserId: owner || null } : {}) });
      await client.invalidateQueries({ queryKey: ["sheets", campaign.id] });
      router.push(withBase(`${base}/${sheet.id}`, inDemo()));
    } catch (error) {
      toast("danger", error instanceof DmError ? error.message : "Could not create the sheet.");
      setBusy(false);
    }
  }

  const groups = new Map<string, SheetSummary[]>();
  for (const sheet of list.data ?? []) {
    const key = sheet.owner ? (sheet.owner.you ? "You" : sheet.owner.name) : "Not assigned";
    groups.set(key, [...(groups.get(key) ?? []), sheet]);
  }

  return (
    <div className="space-y-6">
      <PageHeader title={campaign.name} description={manager ? "Every character in this campaign. Open one to see and change it." : "Your characters in this campaign."} />
      {battleHref ? (
        <PortalLink href={battleHref} className="flex items-center gap-3 rounded-3xl border border-accent/40 bg-accent-soft/40 p-4 transition hover:border-accent">
          <Swords className="size-5 text-accent" aria-hidden />
          <span className="font-medium">Battle</span>
          <span className="text-sm text-muted">Initiative, whose turn it is, and your notes</span>
        </PortalLink>
      ) : null}
      {list.isError ? <Notice tone="danger">Could not load the sheets.</Notice> : null}
      {list.data && list.data.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border py-6">
          <EmptyState icon={UserRound} title="No characters yet">
            Make one below.
          </EmptyState>
        </div>
      ) : null}
      {[...groups.entries()].map(([group, items]) => (
        <section key={group} className="space-y-2">
          {manager ? <h2 className="text-sm font-semibold text-muted">{group}</h2> : null}
          <ul className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {items.map((sheet) => (
              <li key={sheet.id}>
                <PortalLink href={`${base}/${sheet.id}`} className="block rounded-3xl border border-border bg-surface p-4 shadow-card transition hover:border-border-strong">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">{sheet.name}</span>
                    {sheet.active ? <Badge tone="ok">In play</Badge> : null}
                    {sheet.status !== "active" ? <Badge tone="warn">{sheet.status === "dead" ? "Dead" : "Retired"}</Badge> : null}
                    {manager && sheet.nameSync === "pending" ? <Badge tone="warn">Bot name pending</Badge> : null}
                  </div>
                  <p className="text-sm text-muted">
                    {sheet.classes} · level {sheet.level}
                  </p>
                  <p className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                    <span className="inline-flex items-center gap-1">
                      <Heart className="size-3.5 text-danger" aria-hidden /> {sheet.hp}/{sheet.maxHp}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Shield className="size-3.5" aria-hidden /> {sheet.ac}
                    </span>
                    {sheet.conditions.map((c) => (
                      <Badge key={c} tone="warn">
                        {c}
                      </Badge>
                    ))}
                    {sheet.concentration ? <Badge tone="accent">{sheet.concentration}</Badge> : null}
                  </p>
                </PortalLink>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <form
        className="space-y-3 rounded-3xl border border-border bg-surface p-4 shadow-card"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <h2 className="text-sm font-semibold">New character</h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block min-w-48 flex-1 text-xs text-muted">
            Name
            <input className={`${inputClass} mt-1`} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="block text-xs text-muted">
            Rules
            <select className={`${inputBaseClass} mt-1 h-11`} value={edition} onChange={(event) => setEdition(event.target.value as "2014" | "2024")}>
              <option value="2024">2024 (SRD 5.2)</option>
              <option value="2014">2014 (SRD 5.1)</option>
            </select>
          </label>
          {manager ? (
            <label className="block text-xs text-muted">
              Player
              <select className={`${inputBaseClass} mt-1 h-11`} value={owner} onChange={(event) => setOwner(event.target.value)}>
                <option value="">Nobody yet</option>
                {(players.data ?? []).map((p) => (
                  <option key={p.userId} value={p.userId}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Button type="submit" variant="primary" icon={Plus} busy={busy} disabled={!name.trim()}>
            Create
          </Button>
        </div>
        {manager ? <p className="text-xs text-faint">Only people who have signed in to the portal and play in this campaign can be picked.</p> : null}
      </form>
    </div>
  );
}

/** A sheet loaded in the browser (the demo; or after client navigation). */
export function SheetLoader({ id, backHref, initial, otherCampaigns }: { id: string; backHref: string; initial?: SheetView; otherCampaigns?: { id: string; name: string }[] }) {
  const query = useQuery({ queryKey: ["sheet-view", id], queryFn: () => sheets.get(id), initialData: initial, staleTime: Infinity });
  if (query.isPending) return <p className="text-sm text-muted">Loading…</p>;
  if (query.isError) return <Notice tone="danger">That sheet could not be opened.</Notice>;
  return <SheetPage initial={query.data} backHref={backHref} otherCampaigns={otherCampaigns} />;
}
