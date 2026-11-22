import type { Metadata } from "next";
import { DemoStoryOverview } from "@/components/demo/dm/DemoStory";

export const metadata: Metadata = { title: "Story" };

export default function DemoStoryPage() {
  return <DemoStoryOverview />;
}
