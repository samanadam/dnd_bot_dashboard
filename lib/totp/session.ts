import "server-only";
import { UserRepo } from "@/lib/access/grants";
import { hasAnyAccess } from "@/lib/access/permissions";
import { accessFor, rememberRoles } from "@/lib/access/store";
import { getDatabase } from "@/lib/dm/database";
import { TotpRepo } from "./repo";

/**
 * The roles a code-sign-in session runs with, or null when it must end. Run on
 * every request, like the Discord re-check: turning the card off, or taking the
 * grants away, ends the session at the next request. Roles are the ones saved at
 * the player's last Discord sign-in (the browser never needs to reach Discord);
 * the owner's "turn off" is how someone who left the server is cut off.
 */
export function totpSessionRoles(userId: string): string[] | null {
  const db = getDatabase();
  const stored = new UserRepo(db).get(userId);
  if (!stored || !new TotpRepo(db).get(userId)) return null;
  if (!hasAnyAccess(accessFor(userId, stored.roleIds))) return null;
  rememberRoles(userId, stored.roleIds);
  return stored.roleIds;
}
