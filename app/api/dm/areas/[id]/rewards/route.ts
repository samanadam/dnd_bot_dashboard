import { areaRewards } from "@/lib/dm/areaRoutes";
import { dmDeps } from "@/lib/dm/routeDeps";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/dm/areas/[id]/rewards">;

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  return areaRewards(dmDeps()).PUT(request, id);
}
