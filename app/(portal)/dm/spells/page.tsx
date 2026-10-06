import type { Metadata } from "next";
import { SpellsView } from "@/components/views/dm/SpellsView";
import { requireDm } from "@/lib/dm/access";

export const metadata: Metadata = { title: "Spells" };
export const dynamic = "force-dynamic";

export default async function SpellsPage() {
  await requireDm();
  return <SpellsView />;
}
