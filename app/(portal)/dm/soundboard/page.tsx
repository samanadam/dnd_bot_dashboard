import type { Metadata } from "next";
import { CampaignSwitcher } from "@/components/CampaignSelect";
import { UploadTracks } from "@/components/bot/music/UploadTracks";
import { DmHeader } from "@/components/dm/DmHeader";
import { DmMusic } from "@/components/dm/DmMusic";
import { SavedLinks } from "@/components/dm/SavedLinks";
import { Scenes } from "@/components/dm/Scenes";
import { Soundboard } from "@/components/dm/Soundboard";
import { requireDm } from "@/lib/dm/access";

export const metadata: Metadata = { title: "Soundboard" };

export default async function SoundboardPage() {
  await requireDm();
  return (
    <div className="space-y-6">
      <DmHeader
        eyebrow="DM Screen"
        title="Sound"
        description="Music, ambience and effects in one place, mixed in the voice channel. Save YouTube links, and save a mood as a scene to bring it back with one tap."
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
