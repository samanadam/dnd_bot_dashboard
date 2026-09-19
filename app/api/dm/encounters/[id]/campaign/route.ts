import { encounterCampaign } from "@/lib/dm/encounterRoutes";
import { dmDeps } from "@/lib/dm/routeDeps";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, context: RouteContext<"/api/dm/encounters/[id]/campaign">) {
  return encounterCampaign(dmDeps()).PUT(request, (await context.params).id);
}
