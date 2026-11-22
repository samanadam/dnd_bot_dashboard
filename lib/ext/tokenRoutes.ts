import { z } from "zod";
import { can } from "@/lib/access/permissions";
import type { DdbLinkRepo } from "@/lib/ddb/links";
import { guardApi, invalidBody, readDmJson, type DmGuardDeps } from "@/lib/dm/guard";
import { json, noContent, type AuditLog } from "@/lib/dm/http";
import { errorResponse } from "@/lib/requestGuard";
import { MAX_TOKENS_PER_USER, type ExtTokenRepo } from "./tokens";

// Pairing the browser extension: a signed-in player makes, lists and revokes
// their own tokens here. (The extension itself uses /api/ext with a token.)

export type ExtTokenRouteDeps = DmGuardDeps & {
  tokens: () => ExtTokenRepo;
  links: () => DdbLinkRepo;
  // Every campaign the bot knows; null when it cannot be asked.
  campaigns: () => Promise<Array<{ id: string; name: string }> | null>;
  log?: AuditLog;
};

const createSchema = z.object({ label: z.string().trim().min(1).max(40), campaignId: z.string().min(1).max(40) }).strict();

export function extTokens(deps: ExtTokenRouteDeps) {
  return {
    /** The caller's tokens, the campaigns they play in, and how each synced character is doing. */
    async GET(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "signed-in");
      if (!guard.ok) return guard.response;
      const campaigns = ((await deps.campaigns()) ?? []).filter((c) => can(guard.access, "play", c.id));
      return json({ tokens: deps.tokens().list(guard.userId), campaigns, synced: deps.links().status(guard.userId) });
    },

    /** `{ label, campaignId }`: the token is in this answer and nowhere else, ever. */
    async POST(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "signed-in");
      if (!guard.ok) return guard.response;
      const body = await readDmJson(request, 2 * 1024);
      if (!body.ok) return body.response;
      const parsed = createSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const playable = ((await deps.campaigns()) ?? []).some((c) => c.id === parsed.data.campaignId) && can(guard.access, "play", parsed.data.campaignId);
      if (!playable) return errorResponse(403, "forbidden", "You do not play in that campaign.");
      if (deps.tokens().list(guard.userId).length >= MAX_TOKENS_PER_USER) return errorResponse(409, "limit", `At most ${MAX_TOKENS_PER_USER} tokens. Revoke one first.`);
      const issued = deps.tokens().issue(guard.userId, parsed.data.campaignId, parsed.data.label);
      deps.log?.({ event: "access_change", userId: guard.userId, method: "POST", path: "ext/tokens", status: 201 });
      return json(issued, 201);
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
