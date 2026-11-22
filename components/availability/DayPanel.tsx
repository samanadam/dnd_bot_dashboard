import { Check, X } from "lucide-react";
import { formatDay } from "@/lib/availability/days";

type Props = {
  day: string | null;
  /** Names of the listed players who are free that day. */
  free: readonly string[];
  /** Every listed player's name. */
  players: readonly string[];
  /** Whether the signed-in user marked this day. */
  mine: boolean;
};

/** Who can and cannot play on the tapped day. Works on a phone, where hover does not exist. */
export function DayPanel({ day, free, players, mine }: Props) {
  if (day === null) {
    return <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted">Tap a day to mark it, and see who else is free.</p>;
  }
  const notFree = players.filter((name) => !free.includes(name));
  return (
    <section aria-live="polite" className="rounded-2xl border border-border bg-surface p-4 shadow-card">
      <h3 className="text-sm font-semibold">{formatDay(day)}</h3>
      <p className="mt-0.5 text-xs text-muted">{mine ? "You marked this day as free." : "You have not marked this day."}</p>
      <div className="mt-3 space-y-2 text-sm">
        <p className="flex items-start gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
          <span>
            <span className="text-muted">Free: </span>
            {free.length > 0 ? free.join(", ") : "nobody yet"}
          </span>
        </p>
        {notFree.length > 0 ? (
          <p className="flex items-start gap-2">
            <X className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            <span>
              <span className="text-muted">Not free: </span>
              {notFree.join(", ")}
            </span>
          </p>
        ) : null}
      </div>
    </section>
  );
}
