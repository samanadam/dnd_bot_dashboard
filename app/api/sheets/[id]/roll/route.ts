import { sheetDeps } from "@/lib/sheets/routeDeps";
import { sheetRoll } from "@/lib/sheets/routes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/sheets/[id]/roll">;

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  return sheetRoll(sheetDeps()).POST(request, id);
}
