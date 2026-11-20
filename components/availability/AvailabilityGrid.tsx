import { formatDay } from "@/lib/availability/days";

type Props = {
  days: readonly string[];
  today: string;
  mine: ReadonlySet<string>;
  counts: Readonly<Record<string, number>>;
  total: number;
  /** Names per day, shown to the owner as a tooltip. */
  who?: Readonly<Record<string, string[]>>;
  onToggle: (day: string) => void;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Monday-first column of a day (0 = Monday).
const column = (day: string) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;

/** The next weeks as a calendar: tap a day to say you can play. Past days are read-only. */
export function AvailabilityGrid({ days, today, mine, counts, total, who, onToggle }: Props) {
  const offset = days.length > 0 ? column(days[0]) : 0;
  return (
    <div className="grid grid-cols-7 gap-1.5 sm:gap-2" role="grid" aria-label="Session days">
      {WEEKDAYS.map((name) => (
        <div key={name} className="pb-1 text-center text-xs font-medium text-muted" role="columnheader">
          {name}
        </div>
      ))}
      {Array.from({ length: offset }, (_, i) => (
        <div key={`gap-${i}`} aria-hidden />
      ))}
      {days.map((day) => {
        const past = day < today;
        const free = mine.has(day);
        const everyone = total >= 2 && (counts[day] ?? 0) === total;
        const names = who?.[day]?.join(", ");
        return (
          <button
            key={day}
            type="button"
            disabled={past}
            aria-pressed={free}
            aria-label={`${formatDay(day)}${free ? ", you are free" : ""}, ${counts[day] ?? 0} of ${total} free`}
            title={names || undefined}
            onClick={() => onToggle(day)}
            className={`flex min-h-14 flex-col items-center justify-center rounded-xl border text-sm transition disabled:opacity-30 ${
              free ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface-2 hover:border-border-strong"
            } ${everyone ? "ring-2 ring-ok" : ""}`}
          >
            <span className="font-medium">{Number(day.slice(8))}</span>
            <span className={`text-[11px] ${free ? "" : "text-muted"}`}>
              {counts[day] ?? 0}/{total}
            </span>
          </button>
        );
      })}
    </div>
  );
}
