import type { Op } from "@/lib/sheets/ops";
import type { Vitals } from "@/lib/sheets/vitals";

// Two-way HP: on a synced sheet the portal may change HP, temp HP and death saves. The change is
// kept here as "what D&D Beyond should hold" until the owner's extension saves it there (it calls
// D&D Beyond's own life/hp/damage-taken and life/death-saves). Everything else stays D&D Beyond's.

const WRITE_BACK_OPS = new Set<Op["op"]>(["damage", "heal", "setHp", "setTemp", "deathSave", "resetDeathSaves"]);

/** Whether every operation is one D&D Beyond can be told about. */
export const onlyWriteBack = (ops: ReadonlyArray<Op>): boolean => ops.length > 0 && ops.every((o) => WRITE_BACK_OPS.has(o.op));

export type HpWrite = { hp: number; tempHp: number; removed: number; successes: number; failures: number };

/** The sheet's HP as D&D Beyond keeps it: damage taken from the maximum, temp HP, death saves. */
export function desiredWrite(vitals: Pick<Vitals, "hp" | "tempHp" | "deathSaves">, maxHp: number): HpWrite {
  return { hp: vitals.hp, tempHp: vitals.tempHp, removed: Math.max(0, maxHp - vitals.hp), successes: vitals.deathSaves.successes, failures: vitals.deathSaves.failures };
}

/** Whether D&D Beyond's data (as read by the sync) already holds the change. */
export const matches = (want: HpWrite, vitals: Pick<Vitals, "hp" | "tempHp" | "deathSaves">): boolean =>
  vitals.hp === want.hp && vitals.tempHp === want.tempHp && vitals.deathSaves.successes === want.successes && vitals.deathSaves.failures === want.failures;

// A change the extension has not saved by then (it is off, or D&D Beyond refused it) is dropped.
export const WRITE_TTL_MS = 10 * 60_000;
export const isFresh = (queuedAt: string, now: number): boolean => now - Date.parse(queuedAt) <= WRITE_TTL_MS;
