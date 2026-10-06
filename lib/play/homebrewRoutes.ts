import { can } from "@/lib/access/permissions";
import { CAMPAIGN_ID, campaignIdSchema } from "@/lib/campaign/selection";
import { customFeatSchema, type FeatRepo } from "@/lib/dm/feats";
import { guardApi, invalidBody, readDmJson, type DmGuardDeps } from "@/lib/dm/guard";
import { json, noContent, type AuditLog } from "@/lib/dm/http";
import { customSpellSchema, SPELL_ID, type SpellRepo } from "@/lib/dm/spells";
import { errorResponse } from "@/lib/requestGuard";

// /api/play/homebrew/{spells,feats}: a player's own inventions, made inside one
// campaign they play in. Private to their author and the DM until the DM shares
// one with the campaign; once shared it is the DM's, and read-only here.

export type HomebrewRouteDeps = DmGuardDeps & { spells: () => SpellRepo; feats: () => FeatRepo; log?: AuditLog };

type Kind = "spells" | "feats";
const missing = () => errorResponse(404, "not_found", "No such homebrew.");

function repo(deps: HomebrewRouteDeps, kind: Kind) {
  return kind === "spells" ? deps.spells() : deps.feats();
}

function schema(kind: Kind) {
  // The campaign is required here and never changed afterwards.
  return kind === "spells" ? customSpellSchema.extend({ campaignId: campaignIdSchema }) : customFeatSchema.extend({ campaignId: campaignIdSchema });
}

export function homebrewCollection(deps: HomebrewRouteDeps, kind: Kind) {
  return {
    /** ?campaign=: the caller's own homebrew there. */
    async GET(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "play");
      if (!guard.ok) return guard.response;
      const campaignId = new URL(request.url).searchParams.get("campaign") ?? "";
      if (!CAMPAIGN_ID.test(campaignId)) return errorResponse(400, "bad_request", "Invalid campaign.");
      if (!can(guard.access, "play", campaignId)) return missing();
      return json(repo(deps, kind).list(campaignId).filter((row) => row.authorUserId === guard.userId));
    },

    async POST(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "play");
      if (!guard.ok) return guard.response;
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = schema(kind).safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      if (!can(guard.access, "play", parsed.data.campaignId)) return missing();
      const created = repo(deps, kind).create(parsed.data as never, { userId: guard.userId, shared: false });
      if (!created) return errorResponse(409, "conflict", "The portal holds as many as it can. Ask the DM to tidy up.");
      deps.log?.({ event: "play_write", userId: guard.userId, method: "POST", path: `play/homebrew/${kind}`, status: 201 });
      return json(created, 201);
    },
  };
}

export function homebrewItem(deps: HomebrewRouteDeps, kind: Kind) {
  async function mine(request: Request, id: string) {
    const guard = await guardApi(request, deps, "play");
    if (!guard.ok) return { ok: false as const, response: guard.response };
    const row = SPELL_ID.test(id) ? repo(deps, kind).get(id) : null;
    if (!row || row.authorUserId !== guard.userId || !row.campaignId || !can(guard.access, "play", row.campaignId)) return { ok: false as const, response: missing() };
    return { ok: true as const, guard, row };
  }
  return {
    async GET(request: Request, id: string): Promise<Response> {
      const found = await mine(request, id);
      return found.ok ? json(found.row) : found.response;
    },

    async PUT(request: Request, id: string): Promise<Response> {
      const found = await mine(request, id);
      if (!found.ok) return found.response;
      if (found.row.shared) return errorResponse(409, "conflict", "The DM shared this with the campaign, so it is theirs to change now.");
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = schema(kind).safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      if (parsed.data.campaignId !== found.row.campaignId) return errorResponse(400, "bad_request", "Homebrew stays in the campaign it was made in.");
      const updated = repo(deps, kind).update(id, parsed.data as never);
      if (!updated) return missing();
      deps.log?.({ event: "play_write", userId: found.guard.userId, method: "PUT", path: `play/homebrew/${kind}/:id`, status: 200 });
      return json(updated);
    },

    async DELETE(request: Request, id: string): Promise<Response> {
      const found = await mine(request, id);
      if (!found.ok) return found.response;
      if (found.row.shared) return errorResponse(409, "conflict", "The DM shared this with the campaign, so it is theirs to remove now.");
      if (!repo(deps, kind).remove(id)) return missing();
      deps.log?.({ event: "play_write", userId: found.guard.userId, method: "DELETE", path: `play/homebrew/${kind}/:id`, status: 204 });
      return noContent();
    },
  };
}
