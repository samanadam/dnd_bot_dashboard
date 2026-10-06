import { resolveAccess, type Access, type Grant } from "@/lib/access/permissions";

// Route handlers take getAccess(); these build one for a test user.

/** As the portal did before role grants: the users in `owners` hold everything. */
export function ownerAccess(user: string | null, owners: readonly string[]): () => Promise<Access | null> {
  return async () => (user ? resolveAccess(user, [], owners, []) : null);
}

/** A non-owner holding these roles under these grants. */
export function grantedAccess(user: string, roleIds: readonly string[], grants: readonly Grant[]): () => Promise<Access | null> {
  return async () => resolveAccess(user, roleIds, [], grants);
}
