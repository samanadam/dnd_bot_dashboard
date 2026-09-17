import "server-only";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/session";
import { isDm } from "./isDm";

export { isDm };

/** Page gate. Signed-in portal users who are not the DM get a plain 404. */
export async function requireDm() {
  const user = await requireUser();
  if (!isDm(user.id, env().DM_USER_IDS)) notFound();
  return user;
}
