import { dmDeps } from "@/lib/dm/routeDeps";
import { savedItem } from "@/lib/dm/savedRoutes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/dm/saved/[id]">;

export async function PUT(request: Request, context: Context) {
  return savedItem(dmDeps()).PUT(request, (await context.params).id);
}

export async function DELETE(request: Request, context: Context) {
  return savedItem(dmDeps()).DELETE(request, (await context.params).id);
}
