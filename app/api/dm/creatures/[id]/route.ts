import { creatureItem } from "@/lib/dm/creatureRoutes";
import { dmDeps } from "@/lib/dm/routeDeps";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/dm/creatures/[id]">;

export async function GET(request: Request, context: Context) {
  return creatureItem(dmDeps()).GET(request, (await context.params).id);
}

export async function PUT(request: Request, context: Context) {
  return creatureItem(dmDeps()).PUT(request, (await context.params).id);
}

export async function DELETE(request: Request, context: Context) {
  return creatureItem(dmDeps()).DELETE(request, (await context.params).id);
}
