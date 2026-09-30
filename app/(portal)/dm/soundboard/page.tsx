import type { Metadata } from "next";
import { SoundView } from "@/components/views/dm/SoundView";
import { requireDm } from "@/lib/dm/access";

export const metadata: Metadata = { title: "Soundboard" };

export default async function SoundboardPage() {
  await requireDm();
  return <SoundView />;
}
