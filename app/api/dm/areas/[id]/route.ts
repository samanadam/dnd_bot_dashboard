import { areaItem } from "@/lib/dm/areaRoutes";
import { dmDeps } from "@/lib/dm/routeDeps";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/dm/areas/[id]">;

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return areaItem(dmDeps()).GET(request, id);
}

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  return areaItem(dmDeps()).PUT(request, id);
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  return areaItem(dmDeps()).DELETE(request, id);
}
