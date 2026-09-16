import type { Metadata } from "next";
import { MusicPanel } from "@/components/bot/music/MusicPanel";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Music" };

export default async function MusicPage() {
  await requireUser();
  return <MusicPanel />;
}
