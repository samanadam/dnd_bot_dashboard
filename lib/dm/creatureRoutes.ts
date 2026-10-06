import { parseSelectionStrict } from "@/lib/campaign/selection";
import { errorResponse } from "@/lib/requestGuard";
import { CREATURE_ID, creatureInputSchema, creatureKindSchema, type Creature, type CreatureRepo } from "./creatures";
import { guardDm, invalidBody, readDmJson, type CampaignScope, type DmGuardDeps } from "./guard";
import { json, noContent, type AuditLog } from "./http";

// Handlers for /api/dm/creatures and /api/dm/creatures/:id. Written as
// factories over injected dependencies so every refusal path is unit-tested.

export type CreatureRouteDeps = DmGuardDeps & { repo: () => CreatureRepo; log?: AuditLog };

const notFound = () => errorResponse(404, "not_found", "No such creature.");

// Custom monsters are a shared library, like the SRD: anyone with the DM tools
// reads them, and only someone whose access covers every campaign changes them.
// NPCs belong to a campaign and follow the caller's campaign scope.
const mayRead = (scope: CampaignScope, creature: Pick<Creature, "kind" | "campaignId">) =>
  creature.kind === "monster" || scope.allows(creature.campaignId);
const mayWrite = (scope: CampaignScope, creature: Pick<Creature, "kind" | "campaignId">) =>
  creature.kind === "monster" ? scope.everywhere : scope.allows(creature.campaignId);

export function creatureCollection(deps: CreatureRouteDeps) {
  return {
    async GET(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const raw = new URL(request.url).searchParams.get("kind");
      const kind = raw === null ? undefined : creatureKindSchema.safeParse(raw);
      if (kind && !kind.success) return errorResponse(400, "bad_request", "Invalid kind.");
      const campaign = parseSelectionStrict(new URL(request.url).searchParams.get("campaign"));
      if (!campaign.ok) return errorResponse(400, "bad_request", "Invalid campaign.");
      const repo = deps.repo();
      if (kind?.data === "monster") return json(repo.list("monster"));
      const npcs = guard.scope.narrow(campaign.selection);
      if (npcs === undefined) return notFound();
      return json(kind?.data === "npc" ? repo.list("npc", npcs) : [...repo.list("monster"), ...repo.list("npc", npcs)]);
    },

    async POST(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = creatureInputSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      if (!mayWrite(guard.scope, { kind: parsed.data.kind, campaignId: parsed.data.campaignId ?? null })) return notFound();
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
      return creature && mayRead(guard.scope, creature) ? json(creature) : notFound();
    },

    async PUT(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      if (!CREATURE_ID.test(id)) return notFound();
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = creatureInputSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const current = deps.repo().get(id);
      if (!current || !mayWrite(guard.scope, current)) return notFound();
      // Moving it, or turning it into the other kind, needs access to where it ends up too.
      const next = { kind: parsed.data.kind, campaignId: parsed.data.campaignId === undefined ? current.campaignId : parsed.data.campaignId };
      if (!mayWrite(guard.scope, next)) return notFound();
      const updated = deps.repo().update(id, parsed.data);
      if (!updated) return notFound();
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "PUT", path: "dm/creatures/:id", status: 200 });
      return json(updated);
    },

    async DELETE(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      if (!CREATURE_ID.test(id)) return notFound();
      const current = deps.repo().get(id);
      if (!current || !mayWrite(guard.scope, current) || !deps.repo().remove(id)) return notFound();
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "DELETE", path: "dm/creatures/:id", status: 204 });
      return noContent();
    },
  };
}
