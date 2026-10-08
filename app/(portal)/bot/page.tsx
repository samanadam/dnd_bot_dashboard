import type { Metadata } from "next";
import { Overview } from "@/components/bot/Overview";
import { requireAccess } from "@/lib/access/server";

export const metadata: Metadata = { title: "D&D Recorder" };

export default async function BotPage() {
  await requireAccess("bot.view");
  return <Overview />;
}
