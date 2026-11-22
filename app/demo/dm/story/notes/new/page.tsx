import type { Metadata } from "next";
import { DemoStoryNew } from "@/components/demo/dm/DemoStory";
import { campaignParam } from "@/components/dm/story/helpers";

export const metadata: Metadata = { title: "New story note" };

export default async function DemoNewStoryNotePage(props: PageProps<"/demo/dm/story/notes/new">) {
  const { title, campaign } = await props.searchParams;
  return <DemoStoryNew initialTitle={typeof title === "string" ? title.slice(0, 120) : ""} initialCampaign={campaignParam(campaign)} />;
}
