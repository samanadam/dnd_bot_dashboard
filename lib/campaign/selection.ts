import { z } from "zod";

// Which campaign the DM is looking at. It is a convenience filter, not a
// permission: the value only narrows what the DM's own pages list.
//
// null      every campaign
// "unassigned"  items that belong to none
// <id>      one campaign (the bot's 12-character hex id)

export const CAMPAIGN_COOKIE = "portal_campaign";
export const CAMPAIGN_ID = /^[a-f0-9]{12}$/;
export const campaignIdSchema = z.string().regex(CAMPAIGN_ID, "invalid campaign id");

export type Selection = string | null;

/** Anything that is not "unassigned" or a well-formed id means "all". */
export function parseSelection(value: string | null | undefined): Selection {
  if (value === "unassigned") return "unassigned";
  return value && CAMPAIGN_ID.test(value) ? value : null;
}

/** Strict variant for query strings: a malformed value is an error, not "all". */
export function parseSelectionStrict(value: string | null): { ok: true; selection: Selection } | { ok: false } {
  if (value === null || value === "") return { ok: true, selection: null };
  const parsed = parseSelection(value);
  return parsed === null ? { ok: false } : { ok: true, selection: parsed };
}

/** A SQL fragment for `campaign_id`; bound parameters only, never interpolated input. */
export function campaignClause(selection: Selection): { sql: string; args: string[] } {
  if (selection === null) return { sql: "", args: [] };
  if (selection === "unassigned") return { sql: "campaign_id IS NULL", args: [] };
  return { sql: "campaign_id = ?", args: [selection] };
}
