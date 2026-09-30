import type { Metadata } from "next";
import { ItemsView } from "@/components/views/dm/ItemsView";
import { requireDm } from "@/lib/dm/access";

export const metadata: Metadata = { title: "Items" };
export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  await requireDm();
  return <ItemsView />;
}
