import type { Metadata } from "next";
import { UploadTracks } from "@/components/bot/music/UploadTracks";
import { DmHeader } from "@/components/dm/DmHeader";
import { Soundboard } from "@/components/dm/Soundboard";
import { requireDm } from "@/lib/dm/access";

export const metadata: Metadata = { title: "Soundboard" };

export default async function SoundboardPage() {
  await requireDm();
  return (
    <div className="space-y-6">
      <DmHeader
        eyebrow="DM Screen"
        title="Soundboard"
        description="Rain, crowds and thunder, mixed over the music in the voice channel. Ambience loops until you stop it; effects play once."
      />
      <section className="rounded-3xl border border-border bg-surface p-4 shadow-card sm:p-6">
        <Soundboard />
      </section>
      <div className="max-w-3xl">
        <UploadTracks defaultFolder="ambience" />
      </div>
    </div>
  );
}
