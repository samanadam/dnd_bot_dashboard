import type { Metadata } from "next";
import { SearchPanel } from "@/components/bot/SearchPanel";

export const metadata: Metadata = { title: "Search" };

export default function DemoSearchPage() {
  return <SearchPanel />;
}
