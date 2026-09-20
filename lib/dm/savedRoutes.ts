import { parseSelectionStrict } from "@/lib/campaign/selection";
import { errorResponse } from "@/lib/requestGuard";
import { guardDm, invalidBody, readDmJson, type DmGuardDeps } from "./guard";
import { json, noContent, type AuditLog } from "./http";
import { SAVED_ID, savedSchema, type SaveResult, type SavedRepo } from "./saved";

export type SavedRouteDeps = DmGuardDeps & { saved: () => SavedRepo; log?: AuditLog };

const missing = () => errorResponse(404, "not_found", "No such saved link.");

function refusal(result: Extract<SaveResult, { ok: false }>): Response {
  if (result.reason === "missing") return missing();
  if (result.reason === "limit") return errorResponse(409, "conflict", "That is the most links you can keep. Delete one first.");
  return errorResponse(409, "conflict", "That video is already saved in this list.");
}

export function savedCollection(deps: SavedRouteDeps) {
  return {
    async GET(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const campaign = parseSelectionStrict(new URL(request.url).searchParams.get("campaign"));
      if (!campaign.ok) return errorResponse(400, "bad_request", "Invalid campaign.");
      return json(deps.saved().list(campaign.selection));
    },

    async POST(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = savedSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const created = deps.saved().create(parsed.data);
      if (!created.ok) return refusal(created);
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "POST", path: "dm/saved", status: 201 });
      return json(created.item, 201);
    },
  };
}

export function savedItem(deps: SavedRouteDeps) {
  return {
    async PUT(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      if (!SAVED_ID.test(id)) return missing();
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = savedSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const updated = deps.saved().update(id, parsed.data);
      if (!updated.ok) return refusal(updated);
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "PUT", path: "dm/saved/:id", status: 200 });
      return json(updated.item);
    },

    async DELETE(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      if (!SAVED_ID.test(id) || !deps.saved().remove(id)) return missing();
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "DELETE", path: "dm/saved/:id", status: 204 });
      return noContent();
    },
  };
}
