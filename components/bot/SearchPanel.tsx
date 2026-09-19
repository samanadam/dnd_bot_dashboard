"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { Fragment, useDeferredValue, useMemo, useState } from "react";
import { BotError } from "@/lib/bot/client";
import type { SearchHit } from "@/lib/bot/types";
import { useTranscriptSearch } from "@/lib/bot/useBotState";
import { useCampaignSelection } from "@/lib/campaign/useSelection";
import { formatDateTime } from "@/lib/format";
import { CampaignSwitcher } from "../CampaignSelect";
import { Card, EmptyState, inputClass, Notice, PageHeader, Skeleton } from "../ui";

/** The bot wraps matched words in [[ ]]; they are shown as marks, never as HTML. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/\[\[([\s\S]*?)\]\]/);
  return (
    <p className="text-pretty text-[15px] leading-relaxed">
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="rounded bg-warn/25 px-0.5 text-text">
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </p>
  );
}

type Group = { id: string; name: string | null; startedAt: string; campaign: string | null; hits: SearchHit[] };

function group(hits: SearchHit[]): Group[] {
  const byId = new Map<string, Group>();
  for (const hit of hits) {
    const existing = byId.get(hit.session_id);
    if (existing) existing.hits.push(hit);
    else byId.set(hit.session_id, { id: hit.session_id, name: hit.session_name, startedAt: hit.started_at, campaign: hit.campaign_name, hits: [hit] });
  }
  return [...byId.values()];
}

export function SearchPanel() {
  const [text, setText] = useState("");
  const deferred = useDeferredValue(text.trim());
  const [campaign] = useCampaignSelection();
  const search = useTranscriptSearch(deferred, campaign);
  const groups = useMemo(() => group(search.data?.results ?? []), [search.data]);
  const ready = deferred.length >= 2;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Search transcripts"
        description="Find what was said across every session: a name, a place, a line."
        action={<CampaignSwitcher />}
      />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
        <label htmlFor="transcript-search" className="sr-only">
          Search transcripts
        </label>
        <input
          id="transcript-search"
          type="search"
          autoFocus
          className={`${inputClass} pl-10`}
          placeholder="Try a name, like Eldrin"
          maxLength={200}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>

      {!ready ? (
        <Card>
          <EmptyState icon={Search} title="Type at least two letters">
            Results appear as you type. Only transcripts that have come back from the transcriber are searched.
          </EmptyState>
        </Card>
      ) : search.isPending ? (
        <Skeleton className="h-40" />
      ) : search.isError ? (
        <Notice title="Search unavailable">
          {search.error instanceof BotError ? search.error.message : "Try again in a moment."}
        </Notice>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState icon={Search} title="Nothing found">
            {search.data?.still_indexing ? "Older sessions are still being prepared for search. Try again in a moment." : "No transcript contains those words."}
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-4">
          {search.data?.still_indexing ? (
            <Notice tone="neutral" title="Still preparing older sessions">
              Search again in a moment to include them.
            </Notice>
          ) : null}
          {groups.map((entry) => (
            <Card
              key={entry.id}
              title={entry.name ?? "Untitled session"}
              subtitle={[formatDateTime(entry.startedAt), entry.campaign].filter(Boolean).join(" · ")}
              padded={false}
            >
              <ul className="divide-y divide-border">
                {entry.hits.map((hit) => (
                  <li key={hit.seq}>
                    <Link
                      href={`/bot/sessions/${encodeURIComponent(hit.session_id)}?seq=${hit.seq}`}
                      className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 px-5 py-3 transition hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:grid-cols-[5.5rem_minmax(0,1fr)]"
                    >
                      <span className="pt-0.5 font-mono text-xs tabular-nums text-faint">{hit.clock ?? ""}</span>
                      <span className="min-w-0">
                        <span className="mb-0.5 block text-sm font-semibold">{hit.speaker}</span>
                        <Snippet text={hit.snippet} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
