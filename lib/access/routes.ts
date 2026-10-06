import { z } from "zod";
import { errorResponse } from "@/lib/requestGuard";
import { guardApi, invalidBody, readDmJson, type DmGuardDeps } from "@/lib/dm/guard";
import { json, noContent, type AuditLog } from "@/lib/dm/http";
import { grantInputSchema, SNOWFLAKE, type GrantRepo, type StoredGrant, type UserRepo } from "./grants";
import { summarise } from "./permissions";

// /api/access: the owner's grant editor, and every user's own access summary.

export const guildRoleSchema = z.object({ id: z.string().regex(SNOWFLAKE), name: z.string().max(100), color: z.number().int(), position: z.number().int() });
export type GuildRole = z.infer<typeof guildRoleSchema>;
export type CampaignChoice = { id: string; name: string; archived: boolean };

export type AccessRouteDeps = DmGuardDeps & {
  grants: () => GrantRepo;
  users: () => UserRepo;
  // null: the bot could not be asked (offline, or older than this portal).
  roles: () => Promise<GuildRole[] | null>;
  campaigns: () => Promise<CampaignChoice[] | null>;
  log?: AuditLog;
};

export type GrantsView = {
  grants: StoredGrant[];
  roles: GuildRole[] | null;
  campaigns: CampaignChoice[] | null;
  // How many people who have signed in hold each role, as of their last check.
  holders: Record<string, number>;
  signedIn: number;
};

const missing = () => errorResponse(404, "not_found", "No such grant.");

function holders(users: UserRepo): { holders: Record<string, number>; signedIn: number } {
  const counts: Record<string, number> = {};
  const all = users.list();
  for (const user of all) for (const role of new Set(user.roleIds)) counts[role] = (counts[role] ?? 0) + 1;
  return { holders: counts, signedIn: all.length };
}

export function accessMe(deps: DmGuardDeps) {
  return {
    /** The caller's own permissions: plain JSON, for showing and hiding controls. */
    async GET(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "signed-in");
      if (!guard.ok) return guard.response;
      return json(summarise(guard.access));
    },
  };
}

export function grantCollection(deps: AccessRouteDeps) {
  return {
    async GET(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "owner");
      if (!guard.ok) return guard.response;
      const [roles, campaigns] = await Promise.all([deps.roles(), deps.campaigns()]);
      const view: GrantsView = { grants: deps.grants().list(), roles, campaigns, ...holders(deps.users()) };
      return json(view);
    },
  };
}

export function grantItem(deps: AccessRouteDeps) {
  return {
    /** Create or replace one role's grant: `{ permissions, scope, label? }`. */
    async PUT(request: Request, roleId: string): Promise<Response> {
      const guard = await guardApi(request, deps, "owner");
      if (!guard.ok) return guard.response;
      if (!SNOWFLAKE.test(roleId)) return missing();
      const body = await readDmJson(request, 8 * 1024);
      if (!body.ok) return body.response;
      const parsed = grantInputSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);

      // Grants name real things only: a role of this server, campaigns the bot knows.
      const [roles, campaigns] = await Promise.all([deps.roles(), deps.campaigns()]);
      if (!roles || !campaigns) return errorResponse(503, "bot_unreachable", "The bot must be online to check the role and campaigns. Try again.");
      const role = roles.find((r) => r.id === roleId);
      if (!role) return errorResponse(400, "bad_request", "That role is not on the server.");
      if (parsed.data.scope !== "all") {
        const known = new Set(campaigns.map((c) => c.id));
        if (parsed.data.scope.some((id) => !known.has(id))) return errorResponse(400, "bad_request", "A campaign in the scope does not exist.");
      }

      const repo = deps.grants();
      const before = repo.get(roleId);
      const saved = repo.put(roleId, { ...parsed.data, label: role.name }, guard.userId);
      deps.log?.({
        event: "access_change",
        userId: guard.userId,
        method: "PUT",
        path: "access/grants/:role",
        status: 200,
        detail: JSON.stringify({
          role: roleId,
          before: before ? { permissions: before.permissions, scope: before.scope } : null,
          after: { permissions: saved.permissions, scope: saved.scope },
        }).slice(0, 2000),
      });
      return json(saved);
    },

    async DELETE(request: Request, roleId: string): Promise<Response> {
      const guard = await guardApi(request, deps, "owner");
      if (!guard.ok) return guard.response;
      if (!SNOWFLAKE.test(roleId)) return missing();
      const repo = deps.grants();
      const before = repo.get(roleId);
      if (!before || !repo.remove(roleId)) return missing();
      deps.log?.({
        event: "access_change",
        userId: guard.userId,
        method: "DELETE",
        path: "access/grants/:role",
        status: 204,
        detail: JSON.stringify({ role: roleId, before: { permissions: before.permissions, scope: before.scope }, after: null }),
      });
      return noContent();
    },
  };
}
