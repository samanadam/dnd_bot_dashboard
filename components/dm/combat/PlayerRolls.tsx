"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Dices, X } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/Providers";
import { Button, inputBaseClass } from "@/components/ui";
import { bot, BotError } from "@/lib/bot/client";
import { keys } from "@/lib/bot/useBotState";
import type { Combatant, Encounter } from "@/lib/dm/encounter";
import { setInitiative } from "@/lib/dm/encounter";
import { matchedReports, matchReport, type Report } from "@/lib/dm/initiativeReports";
import { combat } from "@/lib/sheets/client";

/**
 * Initiative totals players sent with /init. The DM applies each one; nothing
 * is applied by itself, and a name that does not match exactly is assigned by
 * hand.
 */
export function PlayerRolls({
  combatants,
  apply,
  disabled,
  owners,
  encounterId,
}: {
  combatants: readonly Combatant[];
  apply: (change: (encounter: Encounter) => Encounter) => void;
  disabled: boolean;
  // Which Discord user's sheet each linked combatant is: /init lands on their own character.
  owners?: ReadonlyMap<string, string>;
  encounterId?: string;
}) {
  const toast = useToast();
  const client = useQueryClient();
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const [picked, setPicked] = useState<Record<number, string>>({});
  const reports = useQuery({
    queryKey: keys.initiative,
    queryFn: bot.initiative,
    refetchInterval: 5_000,
    retry: false,
  });
  const battleRolls = useQuery({
    queryKey: ["battle-rolls", encounterId],
    queryFn: () => combat.battleRolls(encounterId!),
    enabled: Boolean(encounterId),
    refetchInterval: 5_000,
    retry: false,
  });
  const list: Report[] = reports.data ?? [];
  // Rolls players made on their battle page, for the combatant linked to their sheet.
  const pageRolls = (battleRolls.data ?? []).flatMap((roll) => {
    const target = combatants.find((c) => c.ref?.source === "character" && c.ref.id === roll.characterId);
    return target ? [{ roll, target }] : [];
  });
  if (list.length === 0 && pageRolls.length === 0) return null;

  const matched = matchedReports(list, combatants, owners);
  const refreshPage = () => void client.invalidateQueries({ queryKey: ["battle-rolls", encounterId] });
  const refresh = () => void client.invalidateQueries({ queryKey: keys.initiative });

  async function dismiss(id?: number) {
    try {
      await bot.clearInitiative(id);
    } catch (error) {
      toast("danger", error instanceof BotError ? error.message : "Could not dismiss that.");
    }
    refresh();
  }

  async function take(report: Report, target: Combatant) {
    setBusy(report.id);
    apply((encounter) => setInitiative(encounter, target.id, report.value));
    await dismiss(report.id);
    setBusy(null);
  }

  async function takeAll() {
    setBusy("all");
    // One change per report, in order: each one re-sorts the encounter.
    for (const { report, target } of matched) apply((encounter) => setInitiative(encounter, target.id, report.value));
    for (const { report } of matched) await dismiss(report.id);
    setBusy(null);
  }

  return (
    <section className="rounded-3xl border border-accent/40 bg-surface p-4 shadow-card sm:p-5" aria-label="Player rolls">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Dices className="size-5 text-accent" aria-hidden /> Player rolls
        </h2>
        <div className="ml-auto flex flex-wrap gap-2">
          {matched.length > 1 ? (
            <Button size="sm" variant="primary" icon={Check} busy={busy === "all"} disabled={disabled || busy !== null} onClick={() => void takeAll()}>
              Apply all matching
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void dismiss()}>
            Dismiss all
          </Button>
        </div>
      </div>
      <ul className="space-y-2">
        {pageRolls.map(({ roll, target }) => (
          <li key={`page-${roll.characterId}`} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface-2 px-3 py-2">
            <span className="grid size-10 place-items-center rounded-xl bg-accent-soft font-display text-lg font-bold tabular-nums text-accent">{roll.value}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {target.name}
              <span className="ml-2 text-xs font-normal text-muted">from the battle page · {roll.breakdown}</span>
            </span>
            <Button
              size="sm"
              variant="primary"
              disabled={disabled || busy !== null}
              onClick={async () => {
                apply((encounter) => setInitiative(encounter, target.id, roll.value));
                await combat.dismissBattleRoll(encounterId!, roll.characterId).catch(() => undefined);
                refreshPage();
              }}
            >
              Set {target.name}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Dismiss ${target.name}'s roll`}
              icon={X}
              onClick={async () => {
                await combat.dismissBattleRoll(encounterId!, roll.characterId).catch(() => undefined);
                refreshPage();
              }}
            />
          </li>
        ))}
        {list.map((report) => {
          const target = matchReport(report, combatants, owners);
          const chosen = combatants.find((c) => c.id === picked[report.id]) ?? null;
          const destination = target ?? chosen;
          return (
            <li key={report.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface-2 px-3 py-2">
              <span className="grid size-10 place-items-center rounded-xl bg-accent-soft font-display text-lg font-bold tabular-nums text-accent">{report.value}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{report.label}</span>
              {target ? null : (
                <select
                  aria-label={`Who is ${report.label}?`}
                  className={`${inputBaseClass} h-9 max-w-44 px-2 text-xs`}
                  value={picked[report.id] ?? ""}
                  onChange={(event) => setPicked({ ...picked, [report.id]: event.target.value })}
                >
                  <option value="">Assign to…</option>
                  {combatants.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              <Button size="sm" variant="primary" busy={busy === report.id} disabled={disabled || !destination || busy !== null} onClick={() => destination && void take(report, destination)}>
                {target ? `Set ${target.name}` : "Apply"}
              </Button>
              <Button size="icon" variant="ghost" aria-label={`Dismiss ${report.label}`} icon={X} disabled={busy !== null} onClick={() => void dismiss(report.id)} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
