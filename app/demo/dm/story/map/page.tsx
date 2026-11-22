import type { Metadata } from "next";
import { DemoStoryMap } from "@/components/demo/dm/DemoStory";

export const metadata: Metadata = { title: "Story map" };

export default function DemoStoryMapPage() {
  return <DemoStoryMap />;
}
