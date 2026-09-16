"use client";

import { Music2 } from "lucide-react";
import { useBotOnline, useMusicState } from "@/lib/bot/useBotState";
import { BotError } from "@/lib/bot/client";
import { EmptyState, PageHeader, Skeleton } from "../../ui";
import { QueueList } from "./QueueList";
import { TrackLibrary } from "./TrackLibrary";
import { TransportBar } from "./TransportBar";
import { YouTubeSearch } from "./YouTubeSearch";

export function MusicPanel() {
  const { online } = useBotOnline();
  const music = useMusicState();

  const header = <PageHeader title="Music" description="Ambience and battle themes for the table, played by the bot in voice." />;

  if (music.isPending) {
    return (
      <div className="space-y-6">
        {header}
        <Skeleton className="h-56" />
        <div className="grid gap-6 xl:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (music.isError && !music.data) {
    const disabled = music.error instanceof BotError && music.error.code === "music_disabled";
    return (
      <div className="space-y-6">
        {header}
        <div className="rounded-3xl border border-border bg-surface shadow-card">
          <EmptyState icon={Music2} title={disabled ? "Music is turned off" : "Music unavailable"}>
            {disabled ? "Enable music on the bot to use this page." : music.error instanceof BotError ? music.error.message : "Could not load the player."}
          </EmptyState>
        </div>
      </div>
    );
  }

  const state = music.data!;
  const enabled = online && !music.isError;

  return (
    <div className="space-y-6">
      {header}
      <TransportBar state={state} enabled={enabled} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="space-y-6">
          <TrackLibrary state={state} enabled={enabled} />
          {state.sources.youtube && <YouTubeSearch state={state} enabled={enabled} />}
        </div>
        <QueueList state={state} enabled={enabled} />
      </div>
    </div>
  );
}
