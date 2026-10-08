import { sheetPortrait } from "@/lib/sheets/portraitRoutes";
import { portraitDeps } from "@/lib/sheets/routeDeps";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/sheets/[id]/portrait">;

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return sheetPortrait(portraitDeps()).GET(request, id);
}

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  return sheetPortrait(portraitDeps()).PUT(request, id);
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  return sheetPortrait(portraitDeps()).DELETE(request, id);
}
