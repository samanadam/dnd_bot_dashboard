import { sheetDeps } from "@/lib/sheets/routeDeps";
import { sheetItem } from "@/lib/sheets/routes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/sheets/[id]">;

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return sheetItem(sheetDeps()).GET(request, id);
}

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  return sheetItem(sheetDeps()).PUT(request, id);
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  return sheetItem(sheetDeps()).DELETE(request, id);
}
