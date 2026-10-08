"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, KeyRound, Pencil, Plus, Save, ShieldCheck, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Providers";
import { Badge, Button, Card, EmptyState, Notice, inputBaseClass } from "@/components/ui";
import { ACCESS_KEY, accessApi } from "@/lib/access/client";
import type { StoredGrant } from "@/lib/access/grants";
import { CAMPAIGN_SCOPED, can, PERMISSION_LABELS, PERMISSIONS, PRESETS, resolveAccess, type Permission } from "@/lib/access/permissions";
import type { CampaignChoice, GrantsView, GuildRole } from "@/lib/access/routes";
import { DmError } from "@/lib/dm/client";

const GRANTS_KEY = [...ACCESS_KEY, "grants"] as const;

function colour(role: GuildRole | undefined): string {
  return role && role.color ? `#${role.color.toString(16).padStart(6, "0")}` : "var(--muted)";
}

function RoleChip({ role, fallback }: { role: GuildRole | undefined; fallback: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm font-medium">
      <span className="size-2.5 rounded-full" style={{ background: colour(role) }} aria-hidden />
      {role?.name ?? (fallback || "Unknown role")}
    </span>
  );
}

function presetOf(permissions: readonly string[]): string {
  const sorted = [...permissions].sort().join(",");
  for (const preset of Object.values(PRESETS)) if ([...preset.permissions].sort().join(",") === sorted) return preset.label;
  return "Custom";
}

function scopeText(scope: StoredGrant["scope"], campaigns: CampaignChoice[] | null): string {
  if (scope === "all") return "All campaigns";
  if (scope.length === 0) return "No campaigns";
  return scope.map((id) => campaigns?.find((c) => c.id === id)?.name ?? "Unknown campaign").join(", ");
}

type Draft = { roleId: string; permissions: Set<Permission>; all: boolean; campaigns: Set<string> };

function GrantEditor({
  draft,
  view,
  onChange,
  onCancel,
  onSaved,
}: {
  draft: Draft;
  view: GrantsView;
  onChange: (next: Draft) => void;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const role = view.roles?.find((r) => r.id === draft.roleId);
  const scoped = [...draft.permissions].some((p) => CAMPAIGN_SCOPED.has(p));
  const held = view.holders[draft.roleId] ?? 0;
  const toggle = (permission: Permission) => {
    const next = new Set(draft.permissions);
    if (next.has(permission)) next.delete(permission);
    else next.add(permission);
    onChange({ ...draft, permissions: next });
  };

  const warnings: string[] = [];
  if (draft.permissions.has("dm") && draft.all) warnings.push("This role sees every campaign in the DM tools, including content filed under no campaign.");
  if (view.signedIn > 1 && held > view.signedIn / 2 && [...draft.permissions].some((p) => p !== "play")) {
    warnings.push(`Most people who sign in hold this role (${held} of ${view.signedIn}). Is it meant to grant more than the player area?`);
  }
  if (scoped && !draft.all && draft.campaigns.size === 0) warnings.push("No campaign is picked, so the player and DM permissions here give nothing.");

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await accessApi.putGrant(draft.roleId, {
        permissions: [...draft.permissions],
        scope: draft.all ? "all" : [...draft.campaigns],
      });
      toast("ok", "Access saved. It applies from the next page load.");
      onSaved();
    } catch (caught) {
      setError(caught instanceof DmError ? caught.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-3xl border border-accent/40 bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <RoleChip role={role} fallback={draft.roleId} />
        <span className="text-xs text-muted">{held === 1 ? "1 person who has signed in holds it" : `${held} people who have signed in hold it`}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="self-center text-xs font-medium text-muted">Presets</span>
        {Object.values(PRESETS).map((preset) => (
          <Button key={preset.label} size="sm" onClick={() => onChange({ ...draft, permissions: new Set(preset.permissions) })}>
            {preset.label}
          </Button>
        ))}
      </div>
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">Permissions</legend>
        {PERMISSIONS.map((permission) => (
          <label key={permission} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-bg/30 p-3 transition hover:border-border-strong">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={draft.permissions.has(permission)} onChange={() => toggle(permission)} />
            <span>
              <span className="block text-sm font-medium">
                {PERMISSION_LABELS[permission].label}
                {CAMPAIGN_SCOPED.has(permission) ? null : <span className="ml-1.5 text-xs font-normal text-faint">all campaigns</span>}
              </span>
              <span className="block text-xs text-muted">{PERMISSION_LABELS[permission].description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset disabled={!scoped} className="space-y-2 disabled:opacity-50">
        <legend className="text-sm font-medium">Campaigns</legend>
        <p className="text-xs text-muted">Where the player, sheet and DM permissions apply. Bot permissions always cover everything.</p>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="scope" className="accent-[var(--accent)]" checked={draft.all} onChange={() => onChange({ ...draft, all: true })} />
            All campaigns
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="scope" className="accent-[var(--accent)]" checked={!draft.all} onChange={() => onChange({ ...draft, all: false })} />
            Only these
          </label>
        </div>
        {!draft.all ? (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {(view.campaigns ?? []).map((campaign) => (
              <label key={campaign.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
                  checked={draft.campaigns.has(campaign.id)}
                  onChange={() => {
                    const next = new Set(draft.campaigns);
                    if (next.has(campaign.id)) next.delete(campaign.id);
                    else next.add(campaign.id);
                    onChange({ ...draft, campaigns: next });
                  }}
                />
                {campaign.name}
                {campaign.archived ? <Badge>Archived</Badge> : null}
              </label>
            ))}
          </div>
        ) : null}
      </fieldset>
      {warnings.map((warning) => (
        <Notice key={warning} tone="warn">
          {warning}
        </Notice>
      ))}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex justify-end gap-2">
        <Button icon={X} onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" icon={Save} busy={busy} onClick={() => void save()}>
          Save access
        </Button>
      </div>
    </div>
  );
}

/** Pick roles and see what someone holding exactly those would get. Runs on data already on the page. */
function Preview({ view }: { view: GrantsView }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const roles = view.roles ?? view.grants.map((g) => ({ id: g.roleId, name: g.label, color: 0, position: 0 }));
  const access = useMemo(() => resolveAccess("preview", [...picked], [], view.grants), [picked, view.grants]);
  const campaigns = view.campaigns ?? [];
  return (
    <Card title="Check a combination" subtitle="Tick the roles someone holds to see what they get." icon={KeyRound}>
      <div className="flex flex-wrap gap-2">
        {roles.map((role) => (
          <label key={role.id} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[var(--accent)]"
              checked={picked.has(role.id)}
              onChange={() => {
                const next = new Set(picked);
                if (next.has(role.id)) next.delete(role.id);
                else next.add(role.id);
                setPicked(next);
              }}
            />
            {role.name}
          </label>
        ))}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-96 text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">Permission</th>
              <th className="py-1 font-medium">Where</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {PERMISSIONS.map((permission) => {
              const scope = access.grants.get(permission);
              const where = !scope
                ? "—"
                : scope === "all"
                  ? "Everywhere"
                  : campaigns.filter((c) => can(access, permission, c.id)).map((c) => c.name).join(", ") || "—";
              return (
                <tr key={permission} className={scope ? "" : "text-faint"}>
                  <td className="py-1.5 pr-3">{PERMISSION_LABELS[permission].label}</td>
                  <td className="py-1.5">{where}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function AccessSettings() {
  const toast = useToast();
  const client = useQueryClient();
  const query = useQuery({ queryKey: GRANTS_KEY, queryFn: accessApi.grants });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [adding, setAdding] = useState("");
  const [deleting, setDeleting] = useState<StoredGrant | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => client.invalidateQueries({ queryKey: ACCESS_KEY });

  if (query.isPending) return <p className="text-sm text-muted">Loading…</p>;
  if (query.isError) return <Notice tone="danger">Could not load access settings.</Notice>;
  const view = query.data;
  const granted = new Set(view.grants.map((g) => g.roleId));
  const ungranted = (view.roles ?? []).filter((role) => !granted.has(role.id));

  const open = (grant: StoredGrant) =>
    setDraft({
      roleId: grant.roleId,
      permissions: new Set(grant.permissions.filter((p): p is Permission => (PERMISSIONS as readonly string[]).includes(p))),
      all: grant.scope === "all",
      campaigns: new Set(grant.scope === "all" ? [] : grant.scope),
    });

  return (
    <div className="space-y-6">
      <Notice tone="neutral" title="You are the owner">
        Owners are set in the server config (DM_USER_IDS). They always have every permission everywhere, and only they see this page.
      </Notice>
      {view.roles === null ? (
        <Notice tone="warn" title="The bot did not answer">
          Role names and the campaign list come from the bot. Grants still apply; adding or changing one needs the bot online.
        </Notice>
      ) : null}

      <Card title="Roles and what they allow" subtitle="Someone holding several roles gets everything those roles allow together." icon={ShieldCheck}>
        {view.grants.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No role has access yet">
            Only the owner can sign in until a role is given something.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {view.grants.map((grant) => {
              const role = view.roles?.find((r) => r.id === grant.roleId);
              return (
                <li key={grant.roleId} className="flex flex-wrap items-center gap-3 py-3">
                  <RoleChip role={role} fallback={grant.label} />
                  <Badge tone="accent">{presetOf(grant.permissions)}</Badge>
                  <span className="min-w-0 flex-1 text-xs text-muted">
                    {grant.permissions.map((p) => PERMISSION_LABELS[p as Permission]?.label ?? p).join(" · ") || "Nothing"}
                    <span className="block">{scopeText(grant.scope, view.campaigns)}</span>
                  </span>
                  <span className="text-xs tabular-nums text-faint">{view.holders[grant.roleId] ?? 0} signed in</span>
                  <Button size="sm" icon={Pencil} onClick={() => open(grant)} disabled={view.roles === null}>
                    Edit
                  </Button>
                  <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => setDeleting(grant)}>
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {ungranted.length > 0 && !draft ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <select aria-label="Role to add" className={`${inputBaseClass} h-9`} value={adding} onChange={(event) => setAdding(event.target.value)}>
              <option value="">Give a role access…</option>
              {ungranted.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="primary"
              icon={Plus}
              disabled={!adding}
              onClick={() => {
                setDraft({ roleId: adding, permissions: new Set(PRESETS.player.permissions), all: false, campaigns: new Set() });
                setAdding("");
              }}
            >
              Add
            </Button>
          </div>
        ) : null}
      </Card>

      {draft ? (
        <GrantEditor
          key={draft.roleId}
          draft={draft}
          view={view}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            void refresh();
          }}
        />
      ) : null}

      <Preview view={view} />

      <ConfirmDialog
        open={deleting !== null}
        title={`Remove access for ${deleting?.label || "this role"}?`}
        confirmLabel="Remove"
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          try {
            await accessApi.deleteGrant(deleting.roleId);
            toast("ok", "Access removed.");
            await refresh();
          } catch (error) {
            toast("danger", error instanceof DmError ? error.message : "Could not remove.");
          } finally {
            setBusy(false);
            setDeleting(null);
          }
        }}
      >
        <p className="flex gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          {(() => {
            const n = deleting ? (view.holders[deleting.roleId] ?? 0) : 0;
            return n === 0
              ? "Nobody who has signed in holds this role."
              : `${n} ${n === 1 ? "person" : "people"} who signed in hold this role. Anyone with no other role loses access right away.`;
          })()}
        </p>
      </ConfirmDialog>
    </div>
  );
}
