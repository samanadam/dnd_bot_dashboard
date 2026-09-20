"use client";

import { useMutation } from "@tanstack/react-query";
import { Globe, Search } from "lucide-react";
import { useState } from "react";
import { bot } from "@/lib/bot/client";
import type { PlayerState } from "@/lib/bot/types";
import { WEB_SOURCE_LABEL, type WebSource } from "@/lib/webAudio";
import { Button, Card, EmptyState, inputClass } from "../../ui";
import { TrackRow, usePlay } from "./TrackLibrary";

// One per service; only rendered when the bot reports state.sources[source] === true.
export function WebSearch({ source, state, enabled }: { source: WebSource; state: PlayerState; enabled: boolean }) {
  const label = WEB_SOURCE_LABEL[source];
  const [query, setQuery] = useState("");
  const search = useMutation({ mutationFn: (q: string) => bot.search(source, q) });
  const { play, pendingId } = usePlay(state);

  return (
    <Card title={label} subtitle="Search and play anything" icon={Globe} padded={false}>
      <form
        className="flex gap-2 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (query.trim()) search.mutate(query.trim());
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <input
            type="search"
            className={`${inputClass} pl-10`}
            placeholder="Tavern music, boss battle, rain…"
            aria-label={`Search ${label}`}
            maxLength={200}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Button type="submit" variant="primary" size="lg" className="h-11" disabled={!enabled || !query.trim()} busy={search.isPending}>
          Search
        </Button>
      </form>
      {search.data &&
        (search.data.length === 0 ? (
          <EmptyState icon={Search} title="No results" />
        ) : (
          <ul className="divide-y divide-border border-t border-border py-1">
            {search.data.map((track) => (
              <TrackRow key={track.id} track={track} enabled={enabled} busy={pendingId === track.id} onPlay={() => play(track)} />
            ))}
          </ul>
        ))}
    </Card>
  );
}
