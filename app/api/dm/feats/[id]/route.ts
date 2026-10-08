import { dmDeps } from "@/lib/dm/routeDeps";
import { featItem } from "@/lib/dm/spellRoutes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/dm/feats/[id]">;

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return featItem(dmDeps()).GET(request, id);
}

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  return featItem(dmDeps()).PUT(request, id);
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  return featItem(dmDeps()).PATCH(request, id);
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  return featItem(dmDeps()).DELETE(request, id);
}
