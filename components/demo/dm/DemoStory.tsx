"use client";

import { StoryMapView, StoryNewView, StoryNoteView, StoryNotesView, StoryOverviewView } from "@/components/views/dm/StoryViews";
import { useCampaignSelection } from "@/lib/campaign/useSelection";
import { storyDetailOf, storySummaries } from "@/lib/demo/dmTransport";
import { DemoMissing, WithDemo } from "../DemoFrame";

// The demo's Story pages: the portal filters on the server by the campaign cookie;
// here the same choice comes from the demo's own local value.

export function DemoStoryOverview() {
  const [campaign] = useCampaignSelection();
  return <WithDemo>{(state) => <StoryOverviewView notes={storySummaries(state, campaign)} />}</WithDemo>;
}

export function DemoStoryNotes() {
  const [campaign] = useCampaignSelection();
  return <WithDemo>{(state) => <StoryNotesView notes={storySummaries(state, campaign)} />}</WithDemo>;
}

export function DemoStoryMap() {
  const [campaign] = useCampaignSelection();
  return <WithDemo>{(state) => <StoryMapView notes={storySummaries(state, campaign)} />}</WithDemo>;
}

export function DemoStoryNote({ id }: { id: string }) {
  return (
    <WithDemo>
      {(state) => {
        const note = state.dm.story.find((n) => n.id === id);
        return note ? <StoryNoteView detail={storyDetailOf(state, note)} notes={storySummaries(state, null)} /> : <DemoMissing what="note" back={{ href: "/dm/story/notes", label: "All notes" }} />;
      }}
    </WithDemo>
  );
}

export function DemoStoryNew({ initialTitle, initialCampaign }: { initialTitle: string; initialCampaign?: string | null }) {
  return <WithDemo>{(state) => <StoryNewView notes={storySummaries(state, null)} initialTitle={initialTitle} initialCampaign={initialCampaign} />}</WithDemo>;
}
