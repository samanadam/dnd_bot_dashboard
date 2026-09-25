import { itemItem } from "@/lib/dm/itemRoutes";
import { dmDeps } from "@/lib/dm/routeDeps";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/dm/items/[id]">;

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return itemItem(dmDeps()).GET(request, id);
}

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  return itemItem(dmDeps()).PUT(request, id);
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  return itemItem(dmDeps()).DELETE(request, id);
}
