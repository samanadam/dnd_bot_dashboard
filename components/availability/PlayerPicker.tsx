import type { PlayersView } from "@/lib/availability/client";

type Props = { view: PlayersView; selected: ReadonlySet<string>; onToggle: (userId: string) => void };

/** Who counts as "everyone": the owner ticks the portal users who play. */
export function PlayerPicker({ view, selected, onToggle }: Props) {
  if (view.candidates.length === 0) return <p className="text-sm text-muted">Nobody has signed in yet.</p>;
  return (
    <ul className="space-y-2">
      {view.candidates.map((user) => (
        <li key={user.userId}>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface-2 px-3">
            <input type="checkbox" checked={selected.has(user.userId)} onChange={() => onToggle(user.userId)} className="size-4" />
            <span className="text-sm font-medium">{user.displayName}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
