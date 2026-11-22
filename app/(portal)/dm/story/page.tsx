import type { Metadata } from "next";
import { StoryOverviewView } from "@/components/views/dm/StoryViews";
import { dmSelection, requireDm } from "@/lib/dm/access";
import { getDatabase } from "@/lib/dm/database";
import { StoryRepo } from "@/lib/dm/story";

export const metadata: Metadata = { title: "Story" };
export const dynamic = "force-dynamic";

export default async function StoryPage() {
  const { scope } = await requireDm();
  return <StoryOverviewView notes={new StoryRepo(getDatabase()).list(await dmSelection(scope))} />;
}
