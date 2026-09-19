"use client";

import { Music2 } from "lucide-react";
import { BotError } from "@/lib/bot/client";
import { useBotOnline, useMusicState } from "@/lib/bot/useBotState";
import { TrackLibrary } from "../bot/music/TrackLibrary";
import { TransportBar } from "../bot/music/TransportBar";
import { EmptyState, Skeleton } from "../ui";

/** The music player on the DM Screen, so music, ambience and effects live on one page. */
export function DmMusic() {
  const { online } = useBotOnline();
  const music = useMusicState();

  if (music.isPending) return <Skeleton className="h-56" />;
  if (music.isError && !music.data) {
    const disabled = music.error instanceof BotError && music.error.code === "music_disabled";
    return (
      <EmptyState icon={Music2} title={disabled ? "Music is turned off" : "Music unavailable"}>
        {disabled ? "Enable music on the bot to use it here." : music.error instanceof BotError ? music.error.message : "Could not load the player."}
      </EmptyState>
    );
  }
  const state = music.data!;
  const enabled = online && !music.isError;
  return (
    <div className="space-y-4">
      <TransportBar state={state} enabled={enabled} />
      <TrackLibrary state={state} enabled={enabled} canManage />
    </div>
  );
}
