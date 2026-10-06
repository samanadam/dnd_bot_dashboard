import type { Metadata } from "next";
import { HubView } from "@/components/views/HubView";
import { requireUser } from "@/lib/session";
import { getAccess } from "@/lib/access/server";
import { visibleTools } from "@/lib/tools/registry";

export const metadata: Metadata = { title: "Home" };

export default async function HubPage() {
  const user = await requireUser();
  return <HubView name={user.name ?? null} tools={visibleTools((await getAccess())!)} />;
}
