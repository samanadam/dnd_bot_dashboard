import type { Metadata } from "next";
import { ItemsView } from "@/components/views/dm/ItemsView";

export const metadata: Metadata = { title: "Items" };

export default function DemoItemsPage() {
  return <ItemsView />;
}
