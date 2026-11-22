import type { Metadata } from "next";
import { StoryMapView } from "@/components/views/dm/StoryViews";
import { dmSelection, requireDm } from "@/lib/dm/access";
import { getDatabase } from "@/lib/dm/database";
import { StoryRepo } from "@/lib/dm/story";

export const metadata: Metadata = { title: "Story map" };
export const dynamic = "force-dynamic";

export default async function StoryMapPage() {
  const { scope } = await requireDm();
  return <StoryMapView notes={new StoryRepo(getDatabase()).list(await dmSelection(scope))} />;
}
