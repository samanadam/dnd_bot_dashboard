import { sheetDeps } from "@/lib/sheets/routeDeps";
import { sheetCopy } from "@/lib/sheets/routes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/sheets/[id]/copy">;

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  return sheetCopy(sheetDeps()).POST(request, id);
}
