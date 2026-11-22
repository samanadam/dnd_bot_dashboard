import type { Metadata } from "next";
import { StoryNewView } from "@/components/views/dm/StoryViews";
import { dmSelection, requireDm } from "@/lib/dm/access";
import { getDatabase } from "@/lib/dm/database";
import { StoryRepo } from "@/lib/dm/story";

export const metadata: Metadata = { title: "New story note" };
export const dynamic = "force-dynamic";

export default async function NewStoryNotePage(props: PageProps<"/dm/story/notes/new">) {
  const { scope } = await requireDm();
  const { title } = await props.searchParams;
  return <StoryNewView notes={new StoryRepo(getDatabase()).list(await dmSelection(scope))} initialTitle={typeof title === "string" ? title.slice(0, 120) : ""} />;
}
