import type { Metadata } from "next";
import { DemoStoryNotes } from "@/components/demo/dm/DemoStory";

export const metadata: Metadata = { title: "Story notes" };

export default function DemoStoryNotesPage() {
  return <DemoStoryNotes />;
}
