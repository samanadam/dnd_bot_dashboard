import { dmDeps } from "@/lib/dm/routeDeps";
import { sceneItem } from "@/lib/dm/sceneRoutes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/dm/scenes/[id]">;

export async function GET(request: Request, context: Context) {
  return sceneItem(dmDeps()).GET(request, (await context.params).id);
}

export async function PUT(request: Request, context: Context) {
  return sceneItem(dmDeps()).PUT(request, (await context.params).id);
}

export async function DELETE(request: Request, context: Context) {
  return sceneItem(dmDeps()).DELETE(request, (await context.params).id);
}
