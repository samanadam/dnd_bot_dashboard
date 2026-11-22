import { Check } from "lucide-react";
import { formatDay } from "@/lib/availability/days";
import { heat, monthBlocks } from "@/lib/availability/view";

type Props = {
  days: readonly string[];
  today: string;
  mine: ReadonlySet<string>;
  counts: Readonly<Record<string, number>>;
  total: number;
  selected: string | null;
  onSelect: (day: string) => void;
  /** Weekday 0 (Monday) to 6 (Sunday): tick or untick every upcoming one. */
  onWeekday: (weekday: number) => void;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Strongest tint, as a share of the theme's "ok" colour mixed into the card
// colour. Capped so the day number stays readable on every theme, light or dark.
const MAX_TINT = 38;

/**
 * The next weeks as month blocks. Every colour comes from the theme variables,
 * so it follows whichever theme is chosen: more free players means a stronger
 * tint, your own days carry an accent check, and a day everyone can do gets a
 * solid border and an "All" label.
 */
export function AvailabilityGrid({ days, today, mine, counts, total, selected, onSelect, onWeekday }: Props) {
  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-1.5 sm:gap-2" role="row">
        {WEEKDAYS.map((name, index) => (
          <button
            key={name}
            type="button"
            onClick={() => onWeekday(index)}
            aria-label={`Tick or untick every upcoming ${WEEKDAY_NAMES[index]}`}
            title={`Every ${WEEKDAY_NAMES[index]}`}
            className="rounded-lg py-1.5 text-center text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
          >
            {name}
          </button>
        ))}
      </div>

      <div className="space-y-7">
        {monthBlocks(days).map((block) => (
          <section key={block.key} aria-labelledby={`month-${block.key}`}>
            <h3 id={`month-${block.key}`} className="mb-2 font-display text-lg font-semibold tracking-tight">
              {block.label}
            </h3>
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2" role="grid">
              {block.cells.map((day, index) => {
                if (day === null) return <div key={`gap-${block.key}-${index}`} aria-hidden />;
                const count = counts[day] ?? 0;
                const past = day < today;
                const isToday = day === today;
                const free = mine.has(day);
                const everyone = total >= 2 && count === total;
                const tint = Math.round(heat(count, total) * MAX_TINT);
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={past}
                    aria-pressed={free}
                    aria-current={isToday ? "date" : undefined}
                    aria-label={`${formatDay(day)}${isToday ? ", today" : ""}${free ? ", you are free" : ""}, ${count} of ${total} free`}
                    data-selected={selected === day ? "true" : undefined}
                    onClick={() => onSelect(day)}
                    style={{ background: `color-mix(in oklab, var(--ok) ${tint}%, var(--surface-2))` }}
                    className={`relative flex min-h-14 flex-col items-center justify-center rounded-xl border text-sm transition hover:border-border-strong focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-35 ${
                      everyone ? "border-ok" : free ? "border-accent" : "border-border"
                    } ${selected === day ? "ring-2 ring-accent-2 ring-offset-1 ring-offset-bg" : ""}`}
                  >
                    {isToday ? <span className="absolute left-1.5 top-1.5 size-1.5 rounded-full bg-accent-2" aria-hidden /> : null}
                    {free ? <Check className="absolute right-1 top-1 size-3.5 text-accent" strokeWidth={3} aria-hidden /> : null}
                    <span className="font-medium">{Number(day.slice(8))}</span>
                    <span className={`h-4 text-[11px] leading-4 ${everyone ? "font-semibold text-ok" : "text-muted"}`}>
                      {everyone ? "All" : count > 0 ? `${count}/${total}` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
