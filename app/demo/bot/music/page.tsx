import type { Metadata } from "next";
import { MusicPanel } from "@/components/bot/music/MusicPanel";

export const metadata: Metadata = { title: "Music" };

export default function DemoMusicPage() {
  return <MusicPanel canManage />;
}
