import type { Metadata } from "next";
import { MusicPanel } from "@/components/bot/music/MusicPanel";
import { can } from "@/lib/access/permissions";
import { requireAccess } from "@/lib/access/server";

export const metadata: Metadata = { title: "Music" };

export default async function MusicPage() {
  const access = await requireAccess("bot.music");
  // Only decides whether upload and delete controls render; the proxy enforces it.
  return <MusicPanel canManage={can(access, "bot.manage")} />;
}
