import { areaEncounters } from "@/lib/dm/areaRoutes";
import { dmDeps } from "@/lib/dm/routeDeps";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/dm/areas/[id]/encounters">;

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  return areaEncounters(dmDeps()).PUT(request, id);
}
