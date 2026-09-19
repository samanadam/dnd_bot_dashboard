import { encounterLaunch } from "@/lib/dm/encounterRoutes";
import { dmDeps } from "@/lib/dm/routeDeps";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: RouteContext<"/api/dm/encounters/[id]/launch">) {
  return encounterLaunch(dmDeps()).POST(request, (await context.params).id);
}
