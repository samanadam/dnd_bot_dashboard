import { errorResponse } from "@/lib/requestGuard";
import type { CreatureRepo } from "./creatures";
import { guardDm, type DmGuardDeps } from "./guard";
import { json, type AuditLog } from "./http";
import type { LibraryPageRepo } from "./libraryPages";
import { sourceLabel } from "./superseded";

// /api/dm/library/sources: which imported books the library holds, and removing
// one (its monsters and its raw pages). The SRD copies it hid reappear by themselves.

export type LibraryRouteDeps = DmGuardDeps & { creatures: () => CreatureRepo; libraryPages: () => LibraryPageRepo; log?: AuditLog };

export const SOURCE_ID = /^ddb:[a-z0-9-]{1,40}$/;

export function librarySources(deps: LibraryRouteDeps) {
  return {
    async GET(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      return json({ sources: deps.creatures().listSources().map((s) => ({ ...s, label: sourceLabel(s.source) })) });
    },
  };
}

export function librarySource(deps: LibraryRouteDeps) {
  return {
    async DELETE(request: Request, source: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      // Imported monsters are a shared library: only access to every campaign removes one.
      if (!guard.scope.everywhere) return errorResponse(404, "not_found", "Unknown endpoint.");
      if (!SOURCE_ID.test(source)) return errorResponse(400, "bad_request", "Invalid source.");
      const removed = deps.creatures().removeSource(source);
      deps.libraryPages().removeSource(source);
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "DELETE", path: "dm/library/sources/:source", status: 200, detail: `${source} removed=${removed}` });
      return json({ removed });
    },
  };
}
