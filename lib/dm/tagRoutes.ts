import { errorResponse } from "@/lib/requestGuard";
import { guardDm, invalidBody, readDmJson, type DmGuardDeps } from "./guard";
import { json, type AuditLog } from "./http";
import { setTagsSchema, type TagRepo } from "./tags";

export type TagRouteDeps = DmGuardDeps & { tags: () => TagRepo; log?: AuditLog };

export function tagRoutes(deps: TagRouteDeps) {
  return {
    /** Every tagged sound: `{ [ref]: tags }`. */
    async GET(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      return json(deps.tags().all());
    },

    /** Replaces one sound's tags; an empty list clears them. */
    async PUT(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = setTagsSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const result = deps.tags().set(parsed.data.ref, parsed.data.tags);
      if (!result.ok) return errorResponse(409, "conflict", "That is the most sounds you can tag. Clear some tags first.");
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "PUT", path: "dm/tags", status: 200 });
      return json({ ref: parsed.data.ref, tags: result.tags });
    },
  };
}
