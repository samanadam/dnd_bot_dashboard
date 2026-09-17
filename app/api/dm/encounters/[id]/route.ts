import { encounterItem } from "@/lib/dm/encounterRoutes";
import { dmDeps } from "@/lib/dm/routeDeps";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/dm/encounters/[id]">;

export async function GET(request: Request, context: Context) {
  return encounterItem(dmDeps()).GET(request, (await context.params).id);
}

export async function PUT(request: Request, context: Context) {
  return encounterItem(dmDeps()).PUT(request, (await context.params).id);
}

export async function DELETE(request: Request, context: Context) {
  return encounterItem(dmDeps()).DELETE(request, (await context.params).id);
}
