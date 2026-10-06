import { sheetDeps } from "@/lib/sheets/routeDeps";
import { sheetOps } from "@/lib/sheets/routes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/sheets/[id]/ops">;

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  return sheetOps(sheetDeps()).POST(request, id);
}
