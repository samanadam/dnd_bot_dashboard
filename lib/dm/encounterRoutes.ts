import { z } from "zod";
import { errorResponse } from "@/lib/requestGuard";
import { encounterSchema } from "./encounter";
import { ENCOUNTER_ID, type EncounterRepo } from "./encounters";
import { guardDm, invalidBody, readDmJson, type DmGuardDeps } from "./guard";
import { json, noContent, type AuditLog } from "./http";

export type EncounterRouteDeps = DmGuardDeps & { encounters: () => EncounterRepo; log?: AuditLog };

const createSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict();
const saveSchema = z.object({ version: z.number().int().min(1), encounter: encounterSchema }).strict();
const missing = () => errorResponse(404, "not_found", "No such encounter.");

export function encounterCollection(deps: EncounterRouteDeps) {
  return {
    async GET(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      return guard.ok ? json(deps.encounters().list()) : guard.response;
    },

    async POST(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = createSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const created = deps.encounters().create(parsed.data.name);
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "POST", path: "dm/encounters", status: 201 });
      return json(created, 201);
    },
  };
}

export function encounterItem(deps: EncounterRouteDeps) {
  return {
    async GET(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const found = ENCOUNTER_ID.test(id) ? deps.encounters().get(id) : null;
      return found ? json(found) : missing();
    },

    async PUT(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      if (!ENCOUNTER_ID.test(id)) return missing();
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = saveSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const repo = deps.encounters();
      const result = repo.save(id, parsed.data.version, parsed.data.encounter);
      if (result === null) return missing();
      if (result === "conflict") {
        return Response.json(
          { error: { code: "conflict", message: "This encounter was changed somewhere else." }, current: repo.get(id) },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }
      // Autosave is frequent; the audit line records that a save happened, never what changed.
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "PUT", path: "dm/encounters/:id", status: 200 });
      return json(result);
    },

    async DELETE(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      if (!ENCOUNTER_ID.test(id) || !deps.encounters().remove(id)) return missing();
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "DELETE", path: "dm/encounters/:id", status: 204 });
      return noContent();
    },
  };
}
