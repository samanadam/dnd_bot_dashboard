import { parseSelectionStrict } from "@/lib/campaign/selection";
import { errorResponse } from "@/lib/requestGuard";
import { AREA_ID, areaEncountersSchema, areaOrderSchema, areaSchema, areaUpdateSchema, MAX_AREAS, type Area, type AreaRepo } from "./areas";
import { areaDetail, type RefLookup } from "./areaView";
import type { EncounterRepo } from "./encounters";
import { guardDm, invalidBody, readDmJson, type DmGuardDeps } from "./guard";
import { json, noContent, type AuditLog } from "./http";
import { REWARD_ID, rewardListSchema, rewardStatusBodySchema } from "./rewards";

// Handlers for /api/dm/areas and below. Every write answers with the whole area
// as the page shows it, so the browser replaces its copy and learns the new version.

export type AreaRouteDeps = DmGuardDeps & {
  areas: () => AreaRepo;
  encounters: () => EncounterRepo;
  lookup: () => RefLookup;
  log?: AuditLog;
};

const missing = () => errorResponse(404, "not_found", "No such area.");
const conflict = () => errorResponse(409, "conflict", "This area was changed somewhere else. Reload it and try again.");

function detail(deps: AreaRouteDeps, area: Area, status = 200): Response {
  return json(areaDetail(area, { areas: deps.areas(), encounters: deps.encounters(), lookup: deps.lookup() }), status);
}

function audit(deps: AreaRouteDeps, userId: string, method: string, path: string, status: number) {
  deps.log?.({ event: "dm_write", userId, method, path, status });
}

export function areaCollection(deps: AreaRouteDeps) {
  return {
    async GET(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const campaign = parseSelectionStrict(new URL(request.url).searchParams.get("campaign"));
      if (!campaign.ok) return errorResponse(400, "bad_request", "Invalid campaign.");
      return json(deps.areas().list(campaign.selection));
    },

    async POST(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = areaSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const created = deps.areas().create(parsed.data);
      if (!created) return errorResponse(409, "conflict", `That is the most areas one campaign can hold (${MAX_AREAS}). Delete one first.`);
      audit(deps, guard.userId, "POST", "dm/areas", 201);
      return detail(deps, created, 201);
    },
  };
}

export function areaOrder(deps: AreaRouteDeps) {
  return {
    /** Puts the areas in the order of the ids sent: `{ ids }`. */
    async PUT(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = areaOrderSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      deps.areas().reorder(parsed.data.ids);
      audit(deps, guard.userId, "PUT", "dm/areas/order", 204);
      return noContent();
    },
  };
}

export function areaItem(deps: AreaRouteDeps) {
  return {
    async GET(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const area = AREA_ID.test(id) ? deps.areas().get(id) : null;
      return area ? detail(deps, area) : missing();
    },

    async PUT(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      if (!AREA_ID.test(id)) return missing();
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = areaUpdateSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const { version, ...input } = parsed.data;
      const updated = deps.areas().update(id, version, input);
      if (!updated) return missing();
      if (updated === "conflict") return conflict();
      audit(deps, guard.userId, "PUT", "dm/areas/:id", 200);
      return detail(deps, updated);
    },

    async DELETE(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      if (!AREA_ID.test(id) || !deps.areas().remove(id)) return missing();
      audit(deps, guard.userId, "DELETE", "dm/areas/:id", 204);
      return noContent();
    },
  };
}

export function areaEncounters(deps: AreaRouteDeps) {
  return {
    /** Replaces the linked battles: `{ version, encounterIds }`, in order. */
    async PUT(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      if (!AREA_ID.test(id)) return missing();
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = areaEncountersSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const result = deps.areas().setEncounters(id, parsed.data.version, parsed.data.encounterIds);
      if (!result) return missing();
      if (result === "conflict") return conflict();
      if (result === "not_prepared") return errorResponse(400, "bad_request", "Only prepared encounters can be linked to an area.");
      audit(deps, guard.userId, "PUT", "dm/areas/:id/encounters", 200);
      return detail(deps, result);
    },
  };
}

export function areaRewards(deps: AreaRouteDeps) {
  return {
    /** Replaces the rewards: `{ version, rewards }`, in order. */
    async PUT(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      if (!AREA_ID.test(id)) return missing();
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = rewardListSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const result = deps.areas().setRewards(id, parsed.data.version, parsed.data.rewards);
      if (!result) return missing();
      if (result === "conflict") return conflict();
      if (result === "bad_battle") return errorResponse(400, "bad_request", "A reward names a battle that is not linked to this area.");
      audit(deps, guard.userId, "PUT", "dm/areas/:id/rewards", 200);
      return detail(deps, result);
    },
  };
}

export function areaReward(deps: AreaRouteDeps) {
  return {
    /** Ticks one reward without touching the area's version: `{ status }`. */
    async PATCH(request: Request, id: string, rewardId: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      if (!AREA_ID.test(id) || !REWARD_ID.test(rewardId)) return errorResponse(404, "not_found", "No such reward.");
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = rewardStatusBodySchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const result = deps.areas().setRewardStatus(id, rewardId, parsed.data.status);
      if (!result) return errorResponse(404, "not_found", "No such reward.");
      if (result === "wrong_kind") return errorResponse(400, "bad_request", "That status does not fit this kind of reward.");
      audit(deps, guard.userId, "PATCH", "dm/areas/:id/rewards/:id", 200);
      const area = deps.areas().get(id);
      return area ? detail(deps, area) : missing();
    },
  };
}
