import type { Metadata } from "next";
import { SoundView } from "@/components/views/dm/SoundView";

export const metadata: Metadata = { title: "Soundboard" };

export default function DemoSoundboardPage() {
  return <SoundView />;
}
