import "server-only";
import { env } from "@/lib/env";
import { getDatabase } from "@/lib/dm/database";
import { GrantRepo, seedGrants, UserRepo } from "./grants";
import { resolveAccess, type Access, type Grant } from "./permissions";

// The server side of access: grants from the database, and the Discord roles
// each signed-in user held at their last check.
//
// Roles live in the encrypted session cookie. Every auth() call runs the jwt
// callback, which hands them to rememberRoles() in the same module instance
// before auth() returns; getAccess() reads them back. They are never put in the
// session object, which the browser can fetch.

const roles = new Map<string, string[]>();

export function rememberRoles(userId: string, roleIds: readonly string[]): void {
  roles.set(userId, [...roleIds]);
}

export function rolesOf(userId: string): string[] {
  return roles.get(userId) ?? [];
}

let seeded = false;

/** Every grant, after the one-time copy of ALLOWED_ROLE_IDS (see seedGrants). */
export function loadGrants(): Grant[] {
  const db = getDatabase();
  if (!seeded) {
    if (seedGrants(db, env().ALLOWED_ROLE_IDS)) console.info(JSON.stringify({ type: "access", event: "grants_seeded", roles: env().ALLOWED_ROLE_IDS.length }));
    else if (env().ALLOWED_ROLE_IDS.length > 0) console.info(JSON.stringify({ type: "access", event: "allowed_role_ids_ignored", detail: "grants are managed in /settings/access" }));
    seeded = true;
  }
  return new GrantRepo(db).list();
}

export function accessFor(userId: string, roleIds: readonly string[]): Access {
  return resolveAccess(userId, roleIds, env().DM_USER_IDS, loadGrants());
}

export function recordUser(userId: string, name: string | null | undefined, image: string | null | undefined, roleIds: readonly string[]): void {
  try {
    new UserRepo(getDatabase()).upsert(userId, name, image, roleIds);
  } catch (error) {
    // Bookkeeping only: never let it block a sign-in.
    console.error(JSON.stringify({ type: "access", event: "record_user_failed", detail: String(error).slice(0, 200) }));
  }
}
