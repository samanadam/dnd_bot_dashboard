import type { Metadata } from "next";
import { StoryNotesView } from "@/components/views/dm/StoryViews";
import { dmSelection, requireDm } from "@/lib/dm/access";
import { getDatabase } from "@/lib/dm/database";
import { StoryRepo } from "@/lib/dm/story";

export const metadata: Metadata = { title: "Story notes" };
export const dynamic = "force-dynamic";

export default async function StoryNotesPage() {
  const { scope } = await requireDm();
  return <StoryNotesView notes={new StoryRepo(getDatabase()).list(await dmSelection(scope))} />;
}
