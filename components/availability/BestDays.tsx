import { CalendarCheck } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { formatDay } from "@/lib/availability/days";
import type { BestDay } from "@/lib/availability/view";

type Props = { best: readonly BestDay[]; total: number; selected: string | null; onPick: (day: string) => void };

/** The upcoming days with the most players free, so nobody has to scan the grid. */
export function BestDays({ best, total, selected, onPick }: Props) {
  return (
    <Card title="Best days" subtitle="Most players free first" icon={CalendarCheck}>
      {best.length === 0 ? (
        <p className="text-sm text-muted">{total < 2 ? "The DM has not listed the players yet." : "No day works for anyone yet. Tick your days and the best dates show up here."}</p>
      ) : (
        <ul className="space-y-2">
          {best.map(({ day, count, missing }) => (
            <li key={day}>
              <button
                type="button"
                onClick={() => onPick(day)}
                aria-current={selected === day ? "true" : undefined}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border bg-surface-2 px-3 py-2.5 text-left transition hover:border-border-strong focus-visible:outline-2 focus-visible:outline-accent ${
                  selected === day ? "border-accent-2" : "border-border"
                }`}
              >
                <span>
                  <span className="block text-sm font-medium">{formatDay(day)}</span>
                  <span className="block text-xs text-muted">{missing.length === 0 ? "Everyone can play" : `Missing: ${missing.join(", ")}`}</span>
                </span>
                <Badge tone={missing.length === 0 ? "ok" : "neutral"}>
                  {count}/{total}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
