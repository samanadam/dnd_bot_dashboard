import { can, type Access } from "@/lib/access/permissions";
import { derive } from "./derive";
import type { StoredSheet } from "./repo";

// Who may do what with a sheet. A manager holds sheets.manage (or dm, which
// implies it) in the sheet's campaign; an owner is a player with `play` there
// whose sheet it is. Players never see each other's sheets.

export function canManage(access: Access, campaignId: string): boolean {
  return can(access, "sheets.manage", campaignId);
}

export function canEdit(access: Access, sheet: Pick<StoredSheet, "campaignId" | "ownerUserId">): boolean {
  return canManage(access, sheet.campaignId) || (can(access, "play", sheet.campaignId) && sheet.ownerUserId === access.userId);
}

/** The sheet as one caller may see it: the DM's notes only for managers. */
export type SheetView = Omit<StoredSheet, "dmNotes" | "ownerUserId" | "portrait"> & {
  owner: { name: string; you: boolean; userId?: string } | null;
  hasPortrait: boolean;
  dmNotes?: string;
  manager: boolean;
};

export function sheetView(sheet: StoredSheet, access: Access, ownerName: string | null): SheetView {
  const manager = canManage(access, sheet.campaignId);
  const { dmNotes, ownerUserId, portrait, ...rest } = sheet;
  return {
    ...rest,
    owner: ownerUserId ? { name: ownerName ?? "A player", you: ownerUserId === access.userId, ...(manager ? { userId: ownerUserId } : {}) } : null,
    hasPortrait: portrait !== null,
    manager,
    ...(manager ? { dmNotes } : {}),
  };
}

export type SheetSummary = {
  id: string;
  campaignId: string;
  name: string;
  edition: StoredSheet["edition"];
  classes: string;
  level: number;
  status: StoredSheet["status"];
  active: boolean;
  owner: { name: string; you: boolean } | null;
  hp: number;
  maxHp: number;
  ac: number;
  conditions: string[];
  concentration: string | null;
  nameSync: StoredSheet["nameSync"];
  vitalsVersion: number;
  version: number;
};

export function summaryOf(sheet: StoredSheet, userId: string, ownerName: string | null): SheetSummary {
  const derived = derive(sheet.body, sheet.vitals, sheet.edition);
  return {
    id: sheet.id,
    campaignId: sheet.campaignId,
    name: sheet.name,
    edition: sheet.edition,
    classes: sheet.body.classes.map((c) => `${c.name} ${c.level}`).join(" / "),
    level: derived.totalLevel,
    status: sheet.status,
    active: sheet.active,
    owner: sheet.ownerUserId ? { name: ownerName ?? "A player", you: sheet.ownerUserId === userId } : null,
    hp: sheet.vitals.hp,
    maxHp: derived.maxHp,
    ac: derived.ac.value,
    conditions: sheet.vitals.conditions.map((c) => c.name),
    concentration: sheet.vitals.concentration?.name ?? null,
    nameSync: sheet.nameSync,
    vitalsVersion: sheet.vitalsVersion,
    version: sheet.version,
  };
}
