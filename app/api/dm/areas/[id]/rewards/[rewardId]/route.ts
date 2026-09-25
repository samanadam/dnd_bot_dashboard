import { areaReward } from "@/lib/dm/areaRoutes";
import { dmDeps } from "@/lib/dm/routeDeps";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/dm/areas/[id]/rewards/[rewardId]">;

export async function PATCH(request: Request, context: Context) {
  const { id, rewardId } = await context.params;
  return areaReward(dmDeps()).PATCH(request, id, rewardId);
}
