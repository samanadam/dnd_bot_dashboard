import { errorResponse } from "@/lib/requestGuard";
import { CREATURE_ID, creatureInputSchema, creatureKindSchema, type CreatureRepo } from "./creatures";
import { guardDm, invalidBody, readDmJson, type DmGuardDeps } from "./guard";
import { json, noContent, type AuditLog } from "./http";

// Handlers for /api/dm/creatures and /api/dm/creatures/:id. Written as
// factories over injected dependencies so every refusal path is unit-tested.

export type CreatureRouteDeps = DmGuardDeps & { repo: () => CreatureRepo; log?: AuditLog };

const notFound = () => errorResponse(404, "not_found", "No such creature.");

export function creatureCollection(deps: CreatureRouteDeps) {
  return {
    async GET(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const raw = new URL(request.url).searchParams.get("kind");
      const kind = raw === null ? undefined : creatureKindSchema.safeParse(raw);
      if (kind && !kind.success) return errorResponse(400, "bad_request", "Invalid kind.");
      return json(deps.repo().list(kind?.data));
    },

    async POST(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = creatureInputSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const created = deps.repo().create(parsed.data);
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "POST", path: "dm/creatures", status: 201 });
      return json(created, 201);
    },
  };
}

export function creatureItem(deps: CreatureRouteDeps) {
  return {
    async GET(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const creature = CREATURE_ID.test(id) ? deps.repo().get(id) : null;
      return creature ? json(creature) : notFound();
    },

    async PUT(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      if (!CREATURE_ID.test(id)) return notFound();
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = creatureInputSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const updated = deps.repo().update(id, parsed.data);
      if (!updated) return notFound();
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "PUT", path: "dm/creatures/:id", status: 200 });
      return json(updated);
    },

    async DELETE(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      if (!CREATURE_ID.test(id) || !deps.repo().remove(id)) return notFound();
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "DELETE", path: "dm/creatures/:id", status: 204 });
      return noContent();
    },
  };
}
