import { errorResponse } from "@/lib/requestGuard";
import { guardDm, invalidBody, readDmJson, type DmGuardDeps } from "./guard";
import { json, type AuditLog } from "./http";
import type { SavedRepo } from "./saved";
import { setTagsSchema, type TagRepo } from "./tags";

// Sounds in the bot's bucket are shared by every campaign. A saved link belongs
// to one, so its tags follow the caller's campaign scope.
export type TagRouteDeps = DmGuardDeps & { tags: () => TagRepo; saved?: () => SavedRepo; log?: AuditLog };

function savedCampaign(deps: TagRouteDeps, ref: string): string | null | undefined {
  if (!ref.startsWith("saved:")) return undefined;
  const row = deps.saved?.().get(ref.slice("saved:".length));
  return row ? row.campaignId : null;
}

export function tagRoutes(deps: TagRouteDeps) {
  return {
    /** Every tagged sound: `{ [ref]: tags }`. */
    async GET(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const all = deps.tags().all();
      if (guard.scope.everywhere) return json(all);
      const visible = Object.fromEntries(
        Object.entries(all).filter(([ref]) => {
          const campaign = savedCampaign(deps, ref);
          return campaign === undefined || guard.scope.allows(campaign);
        }),
      );
      return json(visible);
    },

    /** Replaces one sound's tags; an empty list clears them. */
    async PUT(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = setTagsSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const campaign = savedCampaign(deps, parsed.data.ref);
      if (!guard.scope.everywhere && campaign !== undefined && !guard.scope.allows(campaign)) {
        return errorResponse(404, "not_found", "No such sound.");
      }
      const result = deps.tags().set(parsed.data.ref, parsed.data.tags);
      if (!result.ok) return errorResponse(409, "conflict", "That is the most sounds you can tag. Clear some tags first.");
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "PUT", path: "dm/tags", status: 200 });
      return json({ ref: parsed.data.ref, tags: result.tags });
    },
  };
}
