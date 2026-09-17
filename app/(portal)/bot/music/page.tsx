import type { Metadata } from "next";
import { MusicPanel } from "@/components/bot/music/MusicPanel";
import { isDm } from "@/lib/dm/isDm";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Music" };

export default async function MusicPage() {
  const user = await requireUser();
  // Only decides whether upload and delete controls render; the proxy enforces it.
  return <MusicPanel canManage={isDm(user.id, env().DM_USER_IDS)} />;
}
