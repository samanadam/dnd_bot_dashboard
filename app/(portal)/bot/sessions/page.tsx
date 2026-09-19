import type { Metadata } from "next";
import { SessionHistory } from "@/components/bot/SessionHistory";
import { isDm } from "@/lib/dm/isDm";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Sessions" };

export default async function SessionsPage() {
  const user = await requireUser();
  // Only decides whether the filing control renders; the proxy enforces it.
  return <SessionHistory canManage={isDm(user.id, env().DM_USER_IDS)} />;
}
