"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AvailabilityGrid } from "@/components/availability/AvailabilityGrid";
import { BestDays } from "@/components/availability/BestDays";
import { DayPanel } from "@/components/availability/DayPanel";
import { useToast } from "@/components/Providers";
import { EmptyState, Notice, PageHeader, Skeleton } from "@/components/ui";
import { AVAILABILITY_KEY, availabilityApi } from "@/lib/availability/client";
import { bestDays, toggleWeekday } from "@/lib/availability/view";

const SAVE_DELAY_MS = 500;
const REFRESH_MS = 30_000;

/** Players tap the days they can play; the counts show how close the group is. */
export function AvailabilityView() {
  const client = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: AVAILABILITY_KEY, queryFn: availabilityApi.get, refetchInterval: REFRESH_MS, refetchOnWindowFocus: true });

  // Ticks the server has not confirmed yet. They win over the server's copy so
  // a refresh in between cannot undo a tap; null means nothing is waiting.
  const [pending, setPending] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Quick taps merge into one save: `latest` is what to send, `inflight` counts saves on the way.
  const latest = useRef<string[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inflight = useRef(0);

  const save = useMutation({
    mutationFn: availabilityApi.save,
    onMutate: () => {
      inflight.current += 1;
    },
    onError: () => toast("danger", "Could not save your days. They were put back as they were."),
    onSettled: () => {
      inflight.current -= 1;
      // Only hand control back to the server once no newer tap is waiting or on the way.
      if (inflight.current === 0 && latest.current === null) setPending(null);
      return client.invalidateQueries({ queryKey: AVAILABILITY_KEY });
    },
  });

  // Leaving the page within the delay must not lose the last tap.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (latest.current) void availabilityApi.save(latest.current);
    },
    [],
  );

  const data = query.data;
  const mineList = pending ?? data?.mine ?? [];

  const commit = (days: string[]) => {
    setPending(days);
    latest.current = days;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const next = latest.current;
      latest.current = null;
      if (next) save.mutate(next);
    }, SAVE_DELAY_MS);
  };

  const onSelect = (day: string) => {
    if (!data) return;
    const next = new Set(mineList);
    if (!next.delete(day)) next.add(day);
    setSelected(day);
    commit([...next].sort());
  };

  const saving = pending !== null || save.isPending;
  const best = data ? bestDays({ today: data.today, counts: data.counts, who: data.who, players: data.players }, 3) : [];
  const panel = data ? (
    <DayPanel
      day={selected}
      free={selected ? (data.who[selected] ?? []) : []}
      players={data.players}
      // The names list comes from the server; mine is the local, possibly newer, answer.
      mine={selected ? mineList.includes(selected) : false}
    />
  ) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Availability"
        description="Tap the days you can play. When everyone is free on a day, the DM is told."
        action={
          <span aria-live="polite" className="text-xs text-muted">
            {saving ? "Saving..." : save.isSuccess ? "Saved" : ""}
          </span>
        }
      />
      {query.isError ? <Notice>The calendar could not be loaded.</Notice> : null}
      {query.isPending ? <Skeleton className="h-96 w-full" /> : null}
      {data && data.total < 2 ? (
        <EmptyState icon={CalendarDays} title="No players listed yet">
          The DM picks who plays in the calendar settings. You can already tick your days.
        </EmptyState>
      ) : null}
      {data ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <aside className="space-y-4 lg:order-2 lg:sticky lg:top-6">
            <BestDays best={best} total={data.total} selected={selected} onPick={setSelected} />
            <div className="hidden lg:block">{panel}</div>
          </aside>
          <div className="space-y-4 lg:order-1">
            <AvailabilityGrid
              days={data.days}
              today={data.today}
              mine={new Set(mineList)}
              counts={data.counts}
              total={data.total}
              selected={selected}
              onSelect={onSelect}
              onWeekday={(weekday) => commit(toggleWeekday(mineList, data.days, data.today, weekday))}
            />
            {/* On a phone the panel rides above the bottom nav, so it stays in sight after a tap near the top. */}
            <div className={`lg:hidden ${selected ? "sticky bottom-20 z-10" : ""}`}>{panel}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
