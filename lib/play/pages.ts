import "server-only";
import { notFound, redirect } from "next/navigation";
import { UserRepo } from "@/lib/access/grants";
import { can, type Access } from "@/lib/access/permissions";
import { getAccess } from "@/lib/access/server";
import { CAMPAIGN_ID } from "@/lib/campaign/selection";
import { getDatabase } from "@/lib/dm/database";
import { canEdit, canManage, sheetView, summaryOf, type SheetSummary, type SheetView } from "@/lib/sheets/access";
import { SheetRepo, SHEET_ID } from "@/lib/sheets/repo";
import { playCampaigns, type PlayCampaign } from "./campaigns";

// Server data for the player area's pages, gated exactly like the API.

/** The campaign, when the user plays in it or manages its sheets; otherwise a 404. */
export async function requirePlay(campaignId: string): Promise<{ access: Access; campaign: PlayCampaign; others: PlayCampaign[] }> {
  const access = await getAccess();
  if (!access) redirect("/signin");
  if (!CAMPAIGN_ID.test(campaignId) || !(can(access, "play", campaignId) || canManage(access, campaignId))) notFound();
  const all = (await playCampaigns(access)) ?? [];
  const campaign = all.find((c) => c.id === campaignId) ?? { id: campaignId, name: "Campaign" };
  return { access, campaign, others: all.filter((c) => c.id !== campaignId) };
}

export function sheetSummaries(access: Access, campaignId: string): SheetSummary[] {
  const db = getDatabase();
  const users = new UserRepo(db);
  const manager = canManage(access, campaignId);
  return new SheetRepo(db)
    .list(campaignId, manager ? undefined : access.userId)
    .map((sheet) => summaryOf(sheet, access.userId, sheet.ownerUserId ? (users.get(sheet.ownerUserId)?.displayName ?? null) : null));
}

/** A sheet the user may open, in this campaign; otherwise a 404. */
export function openSheet(access: Access, campaignId: string | null, id: string): SheetView {
  const db = getDatabase();
  const sheet = SHEET_ID.test(id) ? new SheetRepo(db).get(id) : null;
  if (!sheet || !canEdit(access, sheet) || (campaignId !== null && sheet.campaignId !== campaignId)) notFound();
  return sheetView(sheet, access, sheet.ownerUserId ? (new UserRepo(db).get(sheet.ownerUserId)?.displayName ?? null) : null);
}
