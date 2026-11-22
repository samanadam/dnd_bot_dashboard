import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StoryNoteView } from "@/components/views/dm/StoryViews";
import { dmSelection, requireDm } from "@/lib/dm/access";
import { getDatabase } from "@/lib/dm/database";
import { STORY_ID, StoryRepo } from "@/lib/dm/story";

export const metadata: Metadata = { title: "Story note" };
export const dynamic = "force-dynamic";

export default async function StoryNotePage(props: PageProps<"/dm/story/notes/[id]">) {
  const { scope } = await requireDm();
  const { id } = await props.params;
  if (!STORY_ID.test(id)) notFound();
  const story = new StoryRepo(getDatabase());
  const note = story.get(id);
  if (!note || !scope.allows(note.campaignId)) notFound();
  const notes = story.list(await dmSelection(scope));
  // The list may be narrowed to another campaign; the note's own campaign is what its links resolve in.
  const sameCampaign = story.list(note.campaignId ?? "unassigned");
  const summary = sameCampaign.find((s) => s.id === id);
  return <StoryNoteView detail={{ note, backlinks: story.backlinks(id), missing: summary?.missing ?? [] }} notes={[...new Map([...notes, ...sameCampaign].map((s) => [s.id, s])).values()]} />;
}
