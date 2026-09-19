import type { Metadata } from "next";
import { SearchPanel } from "@/components/bot/SearchPanel";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage() {
  await requireUser();
  return <SearchPanel />;
}
