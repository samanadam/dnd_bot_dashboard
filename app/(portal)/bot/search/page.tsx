import type { Metadata } from "next";
import { SearchPanel } from "@/components/bot/SearchPanel";
import { requireAccess } from "@/lib/access/server";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage() {
  await requireAccess("bot.sessions");
  return <SearchPanel />;
}
