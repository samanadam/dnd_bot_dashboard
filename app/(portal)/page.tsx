import type { Metadata } from "next";
import { HubView } from "@/components/views/HubView";
import { isDm } from "@/lib/dm/isDm";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/session";
import { visibleTools } from "@/lib/tools/registry";

export const metadata: Metadata = { title: "Home" };

export default async function HubPage() {
  const user = await requireUser();
  return <HubView name={user.name ?? null} tools={visibleTools(isDm(user.id, env().DM_USER_IDS))} />;
}
