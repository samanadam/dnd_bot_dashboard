import type { Metadata } from "next";
import { SessionHistory } from "@/components/bot/SessionHistory";
import { can } from "@/lib/access/permissions";
import { requireAccess } from "@/lib/access/server";

export const metadata: Metadata = { title: "Sessions" };

export default async function SessionsPage() {
  const access = await requireAccess("bot.sessions");
  // Only decides whether the filing control renders; the proxy enforces it.
  return <SessionHistory canManage={can(access, "bot.manage")} />;
}
