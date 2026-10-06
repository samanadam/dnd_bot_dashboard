import type { Combatant } from "./encounter";

// Totals players reported from Discord with /init. Nothing here applies a total:
// it only decides which combatant a report most likely belongs to, and the DM
// confirms every one.

export type Report = { id: number; label: string; value: number; user_id?: string };

const norm = (text: string) => text.normalize("NFKC").trim().toLocaleLowerCase("en").replace(/\s+/g, " ");

/**
 * The combatant a report names, or null. A match needs the whole name (ignoring
 * case and spacing) and must be unique, so two goblins or a shared name never
 * send a total to the wrong one. Players are preferred over monsters that
 * happen to share a name.
 */
export function matchReport(report: Pick<Report, "label" | "user_id">, combatants: readonly Combatant[], owners?: ReadonlyMap<string, string>): Combatant | null {
  // The reporting member's own character, when it is linked to their sheet: no name guessing.
  if (report.user_id && owners) {
    const theirs = combatants.filter((c) => owners.get(c.id) === report.user_id);
    if (theirs.length === 1) return theirs[0];
  }
  const wanted = norm(report.label);
  if (!wanted) return null;
  const named = combatants.filter((c) => norm(c.name) === wanted);
  const players = named.filter((c) => c.kind === "player");
  const pool = players.length > 0 ? players : named;
  return pool.length === 1 ? pool[0] : null;
}

/** Reports that match exactly one combatant, paired with it. */
export function matchedReports(reports: readonly Report[], combatants: readonly Combatant[], owners?: ReadonlyMap<string, string>) {
  return reports.flatMap((report) => {
    const target = matchReport(report, combatants, owners);
    return target ? [{ report, target }] : [];
  });
}
