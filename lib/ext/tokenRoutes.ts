import { z } from "zod";
import { can } from "@/lib/access/permissions";
import type { DdbLinkRepo } from "@/lib/ddb/links";
import { guardApi, invalidBody, readDmJson, type DmGuardDeps } from "@/lib/dm/guard";
import { json, noContent, type AuditLog } from "@/lib/dm/http";
import { errorResponse } from "@/lib/requestGuard";
import type { SheetRepo } from "@/lib/sheets/repo";
import { syncName, type ExtDeps } from "./routes";
import { MAX_TOKENS_PER_USER, type ExtTokenRepo } from "./tokens";

// Pairing the browser extension: a signed-in player makes, lists and revokes
// their own tokens here. (The extension itself uses /api/ext with a token.)

export type ExtTokenRouteDeps = DmGuardDeps & {
  tokens: () => ExtTokenRepo;
  links: () => DdbLinkRepo;
  sheets: () => SheetRepo;
  // Tells the bot which character a player is in a campaign (null clears it); see ExtDeps.
  syncName?: ExtDeps["syncName"];
  // Every campaign the bot knows; null when it cannot be asked.
  campaigns: () => Promise<Array<{ id: string; name: string }> | null>;
  log?: AuditLog;
};

// A token is good for every campaign the player plays in. A page loaded before that change may
// still send a campaignId; it is accepted and ignored.
const createSchema = z.object({ label: z.string().trim().min(1).max(40), campaignId: z.string().max(40).optional() }).strict();
const choiceSchema = z.object({ ddbCampaignId: z.string().min(1).max(40), campaignId: z.string().min(1).max(40) }).strict();

export function extTokens(deps: ExtTokenRouteDeps) {
  return {
    /** The caller's tokens, the campaigns they play in, how each synced character is doing, and the ones waiting for a campaign. */
    async GET(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "signed-in");
      if (!guard.ok) return guard.response;
      const campaigns = ((await deps.campaigns()) ?? []).filter((c) => can(guard.access, "play", c.id));
      return json({ tokens: deps.tokens().list(guard.userId), campaigns, synced: deps.links().status(guard.userId), pending: deps.links().pending(guard.userId) });
    },

    /** `{ label }`: the token is in this answer and nowhere else, ever. */
    async POST(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "signed-in");
      if (!guard.ok) return guard.response;
      const body = await readDmJson(request, 2 * 1024);
      if (!body.ok) return body.response;
      const parsed = createSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      if (deps.tokens().list(guard.userId).length >= MAX_TOKENS_PER_USER) return errorResponse(409, "limit", `At most ${MAX_TOKENS_PER_USER} tokens. Revoke one first.`);
      const issued = deps.tokens().issue(guard.userId, "", parsed.data.label);
      deps.log?.({ event: "access_change", userId: guard.userId, method: "POST", path: "ext/tokens", status: 201 });
      return json(issued, 201);
    },
  };
}

export function extCampaignChoice(deps: ExtTokenRouteDeps) {
  return {
    /**
     * `{ ddbCampaignId, campaignId }`: which portal campaign a D&D Beyond campaign means. Remembered, and
     * the player's synced sheets of that D&D Beyond campaign move there now. Answers how many moved.
     */
    async PUT(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "signed-in");
      if (!guard.ok) return guard.response;
      const body = await readDmJson(request, 1024);
      if (!body.ok) return body.response;
      const parsed = choiceSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const { ddbCampaignId, campaignId } = parsed.data;
      const known = ((await deps.campaigns()) ?? []).some((c) => c.id === campaignId);
      if (!known || !can(guard.access, "play", campaignId)) return errorResponse(403, "forbidden", "You do not play in that campaign.");

      const links = deps.links();
      const sheets = deps.sheets();
      links.mapCampaign(guard.userId, ddbCampaignId, campaignId);
      links.clearPendingOfCampaign(guard.userId, ddbCampaignId);
      const touched = new Set<string>();
      let moved = 0;
      for (const sheetId of links.sheetsOfDdbCampaign(guard.userId, ddbCampaignId)) {
        const before = sheets.get(sheetId);
        if (!before || before.campaignId === campaignId) continue;
        sheets.moveToCampaign(sheetId, campaignId);
        touched.add(before.campaignId);
        moved += 1;
      }
      if (moved > 0) for (const id of new Set([...touched, campaignId])) await syncName(deps, id, guard.userId);
      deps.log?.({ event: "access_change", userId: guard.userId, method: "PUT", path: "ext/campaign", status: 200 });
      return json({ moved });
    },
  };
}

export function extTokenItem(deps: ExtTokenRouteDeps) {
  return {
    async DELETE(request: Request, id: string): Promise<Response> {
      const guard = await guardApi(request, deps, "signed-in");
      if (!guard.ok) return guard.response;
      if (!deps.tokens().revoke(guard.userId, id)) return errorResponse(404, "not_found", "No such token.");
      deps.log?.({ event: "access_change", userId: guard.userId, method: "DELETE", path: "ext/tokens/:id", status: 204 });
      return noContent();
    },
  };
}
