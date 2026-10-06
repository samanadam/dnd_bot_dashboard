// Who may do what. Discord roles map to permission grants that the owner edits
// in the dashboard; a user's access is the union of their roles' grants. Pure
// and framework-free: the server, the settings page's preview and the tests all
// run the same code.
//
// The owner (DM_USER_IDS in server config) always holds everything, everywhere,
// and is never stored as a grant, so no dashboard edit can lock them out.

export const PERMISSIONS = [
  "bot.view",
  "bot.recording",
  "bot.music",
  "bot.sessions",
  "bot.campaigns",
  "play",
  "sheets.manage",
  "dm",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Permissions limited to the campaigns a grant names. Bot control is global. */
export const CAMPAIGN_SCOPED: ReadonlySet<Permission> = new Set(["play", "sheets.manage", "dm"]);

export const PERMISSION_LABELS: Record<Permission, { label: string; description: string }> = {
  "bot.view": { label: "See the bot", description: "Bot status, recording and music state, the campaign list." },
  "bot.recording": { label: "Recording", description: "Start, stop, split and recover recordings." },
  "bot.music": { label: "Music", description: "Play, queue and upload music; join and leave voice." },
  "bot.sessions": { label: "Sessions", description: "Session list, transcripts, search, renaming and the trash." },
  "bot.campaigns": { label: "Campaigns", description: "Create and edit campaigns, terms and corrections." },
  play: { label: "Player area", description: "Their own character sheets, spells and the battle page." },
  "sheets.manage": { label: "Manage sheets", description: "See and edit every sheet, assign owners." },
  dm: { label: "Co-DM", description: "Every DM tool. Includes managing sheets." },
};

export const PRESETS: Record<"player" | "operator" | "codm", { label: string; permissions: Permission[] }> = {
  player: { label: "Player", permissions: ["play"] },
  operator: { label: "Bot operator", permissions: ["bot.view", "bot.recording", "bot.music", "bot.sessions", "bot.campaigns"] },
  codm: { label: "Co-DM", permissions: ["dm", "bot.view"] },
};

/** "all", or the campaign ids a grant names. */
export type Scope = "all" | ReadonlySet<string>;

export type Grant = { roleId: string; permissions: readonly string[]; scope: "all" | readonly string[] };

export type Access = {
  userId: string;
  owner: boolean;
  grants: ReadonlyMap<Permission, Scope>;
};

const isPermission = (value: string): value is Permission => (PERMISSIONS as readonly string[]).includes(value);

function merge(a: Scope | undefined, b: Scope): Scope {
  if (a === "all" || b === "all") return "all";
  if (!a) return b;
  return new Set([...a, ...b]);
}

/**
 * The union of every grant on the user's roles. Unknown permission names (from a
 * newer build) are ignored. `dm` implies `sheets.manage` with the same scope.
 */
export function resolveAccess(userId: string, roleIds: readonly string[], ownerIds: readonly string[], grants: readonly Grant[]): Access {
  const owner = userId.length > 0 && ownerIds.includes(userId);
  const held = new Map<Permission, Scope>();
  if (owner) {
    for (const permission of PERMISSIONS) held.set(permission, "all");
    return { userId, owner, grants: held };
  }
  const roles = new Set(roleIds);
  for (const grant of grants) {
    if (!roles.has(grant.roleId)) continue;
    const scope: Scope = grant.scope === "all" ? "all" : new Set(grant.scope);
    for (const name of grant.permissions) {
      if (!isPermission(name)) continue;
      // Bot permissions are global whatever the grant says.
      const effective: Scope = CAMPAIGN_SCOPED.has(name) ? scope : "all";
      if (effective !== "all" && effective.size === 0) continue;
      held.set(name, merge(held.get(name), effective));
      if (name === "dm") held.set("sheets.manage", merge(held.get("sheets.manage"), effective));
    }
  }
  return { userId, owner, grants: held };
}

/** Anyone holding at least one permission may sign in. */
export function hasAnyAccess(access: Access): boolean {
  return access.owner || access.grants.size > 0;
}

/**
 * Without a campaign: does the user hold the permission anywhere at all?
 * With a campaign id: in that campaign. With null: over content filed under no
 * campaign, which only the owner and "all campaigns" holders reach.
 */
export function can(access: Access, permission: Permission, campaignId?: string | null): boolean {
  const scope = access.grants.get(permission);
  if (!scope) return false;
  if (campaignId === undefined || scope === "all") return true;
  if (campaignId === null) return false;
  return scope.has(campaignId);
}

/** The campaigns where the user holds a permission, or null when nowhere. */
export function campaignsFor(access: Access, permission: Permission): Scope | null {
  return access.grants.get(permission) ?? null;
}

export function seesUnassigned(access: Access, permission: Permission): boolean {
  return access.grants.get(permission) === "all";
}

/** What the browser may know about its own user's access: plain JSON. */
export type AccessSummary = { owner: boolean; permissions: Partial<Record<Permission, "all" | string[]>> };

export function summarise(access: Access): AccessSummary {
  const permissions: AccessSummary["permissions"] = {};
  for (const [permission, scope] of access.grants) permissions[permission] = scope === "all" ? "all" : [...scope].sort();
  return { owner: access.owner, permissions };
}

export function fromSummary(userId: string, summary: AccessSummary): Access {
  const grants = new Map<Permission, Scope>();
  for (const [permission, scope] of Object.entries(summary.permissions)) {
    if (isPermission(permission) && scope) grants.set(permission, scope === "all" ? "all" : new Set(scope));
  }
  return { userId, owner: summary.owner, grants };
}
