import type { Metadata } from "next";
import { PartyView } from "@/components/views/dm/PartyView";
import { requireDm } from "@/lib/dm/access";

export const metadata: Metadata = { title: "Party" };
export const dynamic = "force-dynamic";

export default async function PartyPage() {
  await requireDm();
  return <PartyView />;
}
