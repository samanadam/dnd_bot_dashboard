import { guardDm } from "@/lib/dm/guard";
import { dmDeps } from "@/lib/dm/routeDeps";
import { getSrd, isEdition } from "@/lib/dm/srd";
import { errorResponse } from "@/lib/requestGuard";

export const dynamic = "force-dynamic";

// One bundled SRD stat block, for the combat tracker's side panel.
export async function GET(request: Request, context: RouteContext<"/api/dm/srd/[edition]/[slug]">) {
  const guard = await guardDm(request, dmDeps());
  if (!guard.ok) return guard.response;
  const { edition, slug } = await context.params;
  const block = isEdition(edition) ? getSrd(edition, slug) : null;
  if (!block) return errorResponse(404, "not_found", "No such monster.");
  // Static data behind a login: the browser may keep it, shared caches may not.
  return Response.json(block, { headers: { "Cache-Control": "private, max-age=3600" } });
}
