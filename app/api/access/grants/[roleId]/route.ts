import { accessDeps } from "@/lib/access/routeDeps";
import { grantItem } from "@/lib/access/routes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/access/grants/[roleId]">;

export async function PUT(request: Request, context: Context) {
  const { roleId } = await context.params;
  return grantItem(accessDeps()).PUT(request, roleId);
}

export async function DELETE(request: Request, context: Context) {
  const { roleId } = await context.params;
  return grantItem(accessDeps()).DELETE(request, roleId);
}
