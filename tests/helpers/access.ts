import { PRESETS, resolveAccess, type Access, type Grant, type Permission } from "@/lib/access/permissions";

// Route handlers take getAccess(); these build one for a test user.

/** As the portal did before role grants: the users in `owners` hold everything. */
export function ownerAccess(user: string | null, owners: readonly string[]): () => Promise<Access | null> {
  return async () => (user ? resolveAccess(user, [], owners, []) : null);
}

/** A non-owner holding these roles under these grants. */
export function grantedAccess(user: string, roleIds: readonly string[], grants: readonly Grant[]): () => Promise<Access | null> {
  return async () => resolveAccess(user, roleIds, [], grants);
}

/**
 * The proxy's answer as it was before role grants: the Bot operator permissions
 * for every signed-in user, everything else for the DM only.
 */
export function legacyAllows(isDm?: (userId: string) => boolean): (userId: string, permission: Permission | "owner") => boolean {
  const open = new Set<string>(PRESETS.operator.permissions);
  return (userId, permission) => open.has(permission) || Boolean(isDm?.(userId));
}
