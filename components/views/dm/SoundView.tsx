import { CampaignSwitcher } from "@/components/CampaignSelect";
import { UploadTracks } from "@/components/bot/music/UploadTracks";
import { DmHeader } from "@/components/dm/DmHeader";
import { DmMusic } from "@/components/dm/DmMusic";
import { SavedLinks } from "@/components/dm/SavedLinks";
import { Scenes } from "@/components/dm/Scenes";
import { Soundboard } from "@/components/dm/Soundboard";

// The DM Screen pages without their data source. The portal's pages read the
// database on the server and pass the result in; the demo's pages pass in what
// the browser-side demo store holds. Either way the same UI renders.

export function SoundView() {
  return (
    <div className="space-y-6">
      <DmHeader
        eyebrow="DM Screen"
        title="Sound"
        description="Music, ambience and effects in one place, mixed in the voice channel. Save YouTube and SoundCloud links, and save a mood as a scene to bring it back with one tap."
        action={<CampaignSwitcher />}
      />
      <section className="rounded-3xl border border-border bg-surface p-4 shadow-card sm:p-6">
        <Scenes />
      </section>
      <section aria-label="Music" className="rounded-3xl border border-border bg-surface p-4 shadow-card sm:p-6">
        <DmMusic />
      </section>
      <section className="rounded-3xl border border-border bg-surface p-4 shadow-card sm:p-6">
        <SavedLinks />
      </section>
      <section className="rounded-3xl border border-border bg-surface p-4 shadow-card sm:p-6">
        <Soundboard />
      </section>
      <div className="max-w-3xl">
        <UploadTracks defaultFolder="ambience" />
      </div>
    </div>
  );
}
