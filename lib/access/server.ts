import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/auth";
import { can, type Access, type Permission } from "./permissions";
import { accessFor, rolesOf } from "./store";

/** The signed-in user's access, or null when nobody is signed in. Once per request. */
export const getAccess = cache(async (): Promise<Access | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return accessFor(userId, rolesOf(userId));
});

/** Page gate: signed out goes to /signin; a missing permission is a plain 404. */
export async function requireAccess(permission: Permission, campaignId?: string | null): Promise<Access> {
  const access = await getAccess();
  if (!access) redirect("/signin");
  if (!can(access, permission, campaignId)) notFound();
  return access;
}

/** Page gate for pages any of several permissions open (the bot overview). */
export async function requireAnyAccess(permissions: readonly Permission[]): Promise<Access> {
  const access = await getAccess();
  if (!access) redirect("/signin");
  if (!permissions.some((permission) => can(access, permission))) notFound();
  return access;
}

/** Page gate for the owner alone (grant editing). */
export async function requireOwner(): Promise<Access> {
  const access = await getAccess();
  if (!access) redirect("/signin");
  if (!access.owner) notFound();
  return access;
}
