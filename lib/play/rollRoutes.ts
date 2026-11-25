import { can } from "@/lib/access/permissions";
import { CAMPAIGN_ID } from "@/lib/campaign/selection";
import { guardApi, type DmGuardDeps } from "@/lib/dm/guard";
import { json } from "@/lib/dm/http";
import { errorResponse } from "@/lib/requestGuard";
import { canManage } from "@/lib/sheets/access";
import type { TableRollRepo } from "./tableRolls";

// /api/play/rolls?campaign=: the table's rolls. Players see the rolls to everyone and their own;
// the DM (anyone who manages the campaign) sees the DM-only ones too.

export type RollFeedDeps = DmGuardDeps & { tableRolls: () => TableRollRepo };

export function tableRollFeed(deps: RollFeedDeps) {
  return {
    async GET(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "signed-in");
      if (!guard.ok) return guard.response;
      const campaignId = new URL(request.url).searchParams.get("campaign") ?? "";
      const dm = CAMPAIGN_ID.test(campaignId) && (canManage(guard.access, campaignId) || can(guard.access, "dm", campaignId));
      if (!CAMPAIGN_ID.test(campaignId) || !(dm || can(guard.access, "play", campaignId))) return errorResponse(404, "not_found", "No such campaign.");
      return json({ rolls: deps.tableRolls().list(campaignId, { userId: guard.userId, seesAll: dm }) });
    },
  };
}
