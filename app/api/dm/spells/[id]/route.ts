import { dmDeps } from "@/lib/dm/routeDeps";
import { spellItem } from "@/lib/dm/spellRoutes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/dm/spells/[id]">;

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return spellItem(dmDeps()).GET(request, id);
}

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  return spellItem(dmDeps()).PUT(request, id);
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  return spellItem(dmDeps()).PATCH(request, id);
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  return spellItem(dmDeps()).DELETE(request, id);
}
