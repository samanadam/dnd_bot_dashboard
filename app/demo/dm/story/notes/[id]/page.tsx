import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoStoryNote } from "@/components/demo/dm/DemoStory";
import { STORY_ID } from "@/lib/dm/story";

export const metadata: Metadata = { title: "Story note" };

export default async function DemoStoryNotePage(props: PageProps<"/demo/dm/story/notes/[id]">) {
  const { id } = await props.params;
  if (!STORY_ID.test(id)) notFound();
  return <DemoStoryNote id={id} />;
}
