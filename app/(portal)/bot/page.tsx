import type { Metadata } from "next";
import { Overview } from "@/components/bot/Overview";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "D&D Recorder" };

export default async function BotPage() {
  await requireUser();
  return <Overview />;
}
