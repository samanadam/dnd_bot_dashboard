"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { AvailabilityGrid } from "@/components/availability/AvailabilityGrid";
import { useToast } from "@/components/Providers";
import { EmptyState, Notice, PageHeader, Skeleton } from "@/components/ui";
import { AVAILABILITY_KEY, availabilityApi, type AvailabilityView as Data } from "@/lib/availability/client";

/** Players tap the days they can play; the counts show how close the group is. */
export function AvailabilityView() {
  const client = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: AVAILABILITY_KEY, queryFn: availabilityApi.get });
  const save = useMutation({
    mutationFn: availabilityApi.save,
    // Show the tap at once; the server's answer replaces it either way.
    onMutate: async (days) => {
      await client.cancelQueries({ queryKey: AVAILABILITY_KEY });
      const before = client.getQueryData<Data>(AVAILABILITY_KEY);
      if (before) client.setQueryData<Data>(AVAILABILITY_KEY, { ...before, mine: days });
      return { before };
    },
    onError: (_error, _days, context) => {
      if (context?.before) client.setQueryData(AVAILABILITY_KEY, context.before);
      toast("danger", "Could not save your days. Try again.");
    },
    onSettled: () => client.invalidateQueries({ queryKey: AVAILABILITY_KEY }),
  });

  const data = query.data;
  const toggle = (day: string) => {
    if (!data) return;
    const mine = new Set(data.mine);
    if (!mine.delete(day)) mine.add(day);
    save.mutate([...mine].sort());
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Availability" description="Tap the days you can play. When everyone is free on a day, the DM is told." />
      {query.isError ? <Notice>The calendar could not be loaded.</Notice> : null}
      {query.isPending ? <Skeleton className="h-80 w-full" /> : null}
      {data && data.total < 2 ? (
        <EmptyState icon={CalendarDays} title="No players listed yet">
          The DM picks who plays in the calendar settings. You can already tick your days.
        </EmptyState>
      ) : null}
      {data ? (
        <AvailabilityGrid days={data.days} today={data.today} mine={new Set(data.mine)} counts={data.counts} total={data.total} who={data.who} onToggle={toggle} />
      ) : null}
    </div>
  );
}
