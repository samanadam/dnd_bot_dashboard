"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Puzzle, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { PortalLink } from "@/components/PortalLink";
import { useToast } from "@/components/Providers";
import { Badge, Button, Card, Field, Notice, Skeleton, inputClass } from "@/components/ui";
import { NO_DDB_CAMPAIGN } from "@/lib/ddb/campaign";
import { useExtension } from "@/lib/ext/bridge";
import { EXT_KEY, extApi } from "@/lib/ext/client";

/** Make and revoke the extension's pairing tokens, and see how each synced character is doing. */
export function ExtensionSettings() {
  const client = useQueryClient();
  const toast = useToast();
  const overview = useQuery({ queryKey: EXT_KEY, queryFn: extApi.overview });
  const [label, setLabel] = useState("My browser");
  const [fresh, setFresh] = useState<string | null>(null);
  const extension = useExtension();

  const campaigns = overview.data?.campaigns ?? [];
  const refresh = () => client.invalidateQueries({ queryKey: EXT_KEY });

  const create = useMutation({
    mutationFn: () => extApi.create(label.trim()),
    onSuccess: (result) => {
      setFresh(result.token);
      return refresh();
    },
    onError: () => toast("danger", "Could not make a token. You can have five at most."),
  });
  const choose = useMutation({
    mutationFn: (input: { ddbCampaignId: string; campaignId: string }) => extApi.choose(input.ddbCampaignId, input.campaignId),
    onSuccess: () => {
      toast("ok", "Saved. The character moves with its next sync.");
      return refresh();
    },
    onError: () => toast("danger", "Could not save that choice."),
  });
  // One click: a token is made for this browser and handed straight to the extension.
  const connect = useMutation({
    mutationFn: async () => {
      const issued = await extApi.create("This browser");
      return extension.pair(issued.token);
    },
    onSuccess: (result) => {
      toast(result.ok ? "ok" : "danger", result.ok ? `Connected. ${result.text}` : result.text);
      return refresh();
    },
    onError: () => toast("danger", "Could not make a token. You can have five at most; revoke an old one."),
  });
  const revoke = useMutation({
    mutationFn: extApi.revoke,
    onSuccess: () => {
      toast("ok", "Token revoked. That browser stops syncing.");
      return refresh();
    },
    onError: () => toast("danger", "Could not revoke it."),
  });

  return (
    <div className="space-y-6">
      <Card title="Browser extension" subtitle="Keeps your D&D Beyond characters live here" icon={Puzzle}>
        {extension.presence.status === "checking" ? <Skeleton className="h-10 w-full" /> : null}
        {extension.presence.status === "missing" ? (
          <div className="space-y-2">
            <Notice tone="warn" title="Not found in this browser">
              Install the extension in Chrome or Edge (see extension/README.md), then come back here. If you just installed it, reload this page.
            </Notice>
            <Button size="sm" icon={RefreshCw} onClick={() => void extension.recheck()}>
              Check again
            </Button>
          </div>
        ) : null}
        {extension.presence.status === "present" ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm">Installed, version {extension.presence.version}</span>
            <Badge tone={extension.presence.paired ? "ok" : "warn"}>{extension.presence.paired ? "Connected" : "Not connected"}</Badge>
            {extension.presence.paired ? <Badge tone={extension.presence.live ? "ok" : "neutral"}>{extension.presence.live ? "Live sync on" : "Live sync off"}</Badge> : null}
            <Button variant={extension.presence.paired ? "secondary" : "primary"} busy={connect.isPending} disabled={campaigns.length === 0} onClick={() => connect.mutate()}>
              {extension.presence.paired ? "Reconnect" : "Connect this browser"}
            </Button>
          </div>
        ) : null}
        {extension.presence.status === "present" && extension.presence.paired && !extension.presence.live ? (
          <p className="mt-2 text-sm text-muted">Open the extension and press Start live sync when you sit down to play, so the table sees your character change as it happens.</p>
        ) : null}
      </Card>

      <Card title="Pair by hand" subtitle="For a browser where the button above does not work: one token per browser, good for every campaign" icon={Link2}>
        {overview.isPending ? <Skeleton className="h-16 w-full" /> : null}
        {overview.isError ? <Notice>Could not load your tokens.</Notice> : null}
        {overview.data && campaigns.length === 0 ? <Notice tone="warn">You do not play in any campaign yet, so there is nothing to sync into.</Notice> : null}
        {campaigns.length > 0 ? (
          <div className="space-y-3">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
              <li>Install the extension in Chrome or Edge (see extension/README.md).</li>
              <li>Make a token here, then paste it with this site&apos;s address into the extension&apos;s Settings page.</li>
              <li>Open your character on D&amp;D Beyond. It appears here within seconds, in the campaign D&amp;D Beyond says it is in.</li>
            </ol>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Name for this browser">
                <input className={inputClass} value={label} maxLength={40} onChange={(event) => setLabel(event.target.value)} />
              </Field>
              <Button variant="primary" busy={create.isPending} disabled={!label.trim()} onClick={() => create.mutate()}>
                Make token
              </Button>
            </div>
            {fresh ? (
              <Notice tone="warn" title="Copy this token now">
                <div className="mt-1 select-all break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs">{fresh}</div>
                <p className="mt-1 text-xs">It is shown once. If you lose it, revoke it and make another.</p>
              </Notice>
            ) : null}
          </div>
        ) : null}
      </Card>

      {overview.data && overview.data.tokens.length > 0 ? (
        <Card title="Your tokens">
          <ul className="space-y-2">
            {overview.data.tokens.map((token) => (
              <li key={token.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2">
                <span className="text-sm">
                  <span className="font-medium">{token.label}</span>{" "}
                  <span className="text-muted">
                    {token.campaignId ? (campaigns.find((c) => c.id === token.campaignId)?.name ?? "Another campaign") : "All campaigns"} · {token.lastUsedAt ? `used ${new Date(token.lastUsedAt).toLocaleString()}` : "never used"}
                  </span>
                </span>
                <Button size="sm" icon={Trash2} busy={revoke.isPending && revoke.variables === token.id} onClick={() => revoke.mutate(token.id)}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {overview.data && overview.data.pending.length > 0 ? (
        <Card title="Waiting for a campaign" subtitle="The extension sent these, but the portal could not tell which campaign they belong to">
          <ul className="space-y-2">
            {overview.data.pending.map((row) => (
              <li key={row.ddbCharacterId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{row.name}</span>{" "}
                  <span className="text-muted">{row.ddbCampaignId === NO_DDB_CAMPAIGN ? "in no D&D Beyond campaign" : `in "${row.ddbCampaignName}" on D&D Beyond`}</span>
                </span>
                <select
                  className={inputClass}
                  value=""
                  aria-label={`Campaign for ${row.name}`}
                  onChange={(event) => event.target.value && choose.mutate({ ddbCampaignId: row.ddbCampaignId, campaignId: event.target.value })}
                >
                  <option value="">Choose a campaign…</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {overview.data && overview.data.synced.length > 0 ? (
        <Card title="Synced characters">
          <ul className="space-y-2">
            {overview.data.synced.map((row) => (
              <li key={row.sheetId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm">
                <PortalLink href={`/play/c/${row.campaignId}/sheets/${row.sheetId}`} className="font-medium text-accent underline-offset-2 hover:underline">
                  {row.name}
                </PortalLink>
                {campaigns.length > 1 ? (
                  <select
                    className={inputClass}
                    value={row.campaignId}
                    aria-label={`Campaign for ${row.name}`}
                    onChange={(event) => event.target.value !== row.campaignId && choose.mutate({ ddbCampaignId: row.ddbCampaignId ?? NO_DDB_CAMPAIGN, campaignId: event.target.value })}
                  >
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <span className="text-muted">last sync {new Date(row.syncedAt).toLocaleString()}</span>
                {row.lastError ? <Badge tone="danger">{row.lastError}</Badge> : <Badge tone="ok">OK</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
