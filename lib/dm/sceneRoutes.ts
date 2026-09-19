import { parseSelectionStrict } from "@/lib/campaign/selection";
import { errorResponse } from "@/lib/requestGuard";
import { guardDm, invalidBody, readDmJson, type DmGuardDeps } from "./guard";
import { json, noContent, type AuditLog } from "./http";
import { SCENE_ID, sceneSchema, type SceneRepo } from "./scenes";

export type SceneRouteDeps = DmGuardDeps & { scenes: () => SceneRepo; log?: AuditLog };

const missing = () => errorResponse(404, "not_found", "No such scene.");

export function sceneCollection(deps: SceneRouteDeps) {
  return {
    async GET(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const campaign = parseSelectionStrict(new URL(request.url).searchParams.get("campaign"));
      if (!campaign.ok) return errorResponse(400, "bad_request", "Invalid campaign.");
      return json(deps.scenes().list(campaign.selection));
    },

    async POST(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = sceneSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const created = deps.scenes().create(parsed.data);
      if (!created) return errorResponse(409, "conflict", "That is the most scenes you can keep. Delete one first.");
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "POST", path: "dm/scenes", status: 201 });
      return json(created, 201);
    },
  };
}

export function sceneItem(deps: SceneRouteDeps) {
  return {
    async GET(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const scene = SCENE_ID.test(id) ? deps.scenes().get(id) : null;
      return scene ? json(scene) : missing();
    },

    async PUT(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      if (!SCENE_ID.test(id)) return missing();
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = sceneSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const updated = deps.scenes().update(id, parsed.data);
      if (!updated) return missing();
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "PUT", path: "dm/scenes/:id", status: 200 });
      return json(updated);
    },

    async DELETE(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      if (!SCENE_ID.test(id) || !deps.scenes().remove(id)) return missing();
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "DELETE", path: "dm/scenes/:id", status: 204 });
      return noContent();
    },
  };
}
