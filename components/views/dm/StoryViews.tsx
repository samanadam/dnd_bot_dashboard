import type { ReactNode } from "react";
import { CampaignSwitcher } from "@/components/CampaignSelect";
import { DmHeader } from "@/components/dm/DmHeader";
import { NoteEditor } from "@/components/dm/story/NoteEditor";
import { NoteList } from "@/components/dm/story/NoteList";
import { NoteReader } from "@/components/dm/story/NoteReader";
import { StoryMap } from "@/components/dm/story/StoryMap";
import { StoryNav, type StoryTab } from "@/components/dm/story/StoryNav";
import { StoryOverview } from "@/components/dm/story/StoryOverview";
import type { StorySummary } from "@/lib/dm/story";
import type { StoryDetail } from "@/lib/dm/storyRoutes";

// The Story pages without their data source. The portal's pages read the database
// on the server and pass the result in; the demo's pages pass in what the browser
// -side demo store holds. Either way the same UI renders.

function Section({ active, title, description, children }: { active: StoryTab; title: string; description?: string; children: ReactNode }) {
  return (
    <div className="space-y-6">
      <DmHeader eyebrow="DM Screen · Story" title={title} description={description} action={<CampaignSwitcher />} />
      <StoryNav active={active} />
      {children}
    </div>
  );
}

export function StoryOverviewView({ notes }: { notes: StorySummary[] }) {
  return (
    <Section active="overview" title="Story" description="The notes behind your campaign: places, people, factions, secrets and sessions, linked into one map.">
      <StoryOverview notes={notes} />
    </Section>
  );
}

export function StoryNotesView({ notes }: { notes: StorySummary[] }) {
  return (
    <Section active="notes" title="Notes">
      <NoteList notes={notes} />
    </Section>
  );
}

export function StoryMapView({ notes }: { notes: StorySummary[] }) {
  return (
    <Section active="map" title="Map" description="Every note is a dot and every [[link]] a line. Click a dot to read the note.">
      <StoryMap notes={notes} />
    </Section>
  );
}

export function StoryNoteView({ detail, notes }: { detail: StoryDetail; notes: StorySummary[] }) {
  return (
    <div className="space-y-6">
      <DmHeader back={{ href: "/dm/story/notes", label: "All notes" }} eyebrow="Story note" title={detail.note.title} />
      {/* Keyed by id and version so a reload from the server replaces the local copy and closes the editor. */}
      <NoteReader key={`${detail.note.id}:${detail.note.version}`} detail={detail} notes={notes} />
    </div>
  );
}

export function StoryNewView({ notes, initialTitle }: { notes: StorySummary[]; initialTitle: string }) {
  return (
    <div className="space-y-6">
      <DmHeader back={{ href: "/dm/story/notes", label: "All notes" }} eyebrow="Story note" title="New note" />
      <NoteEditor notes={notes} initialTitle={initialTitle} />
    </div>
  );
}
