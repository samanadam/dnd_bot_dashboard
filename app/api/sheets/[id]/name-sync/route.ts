import { sheetDeps } from "@/lib/sheets/routeDeps";
import { sheetNameSync } from "@/lib/sheets/routes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/sheets/[id]/name-sync">;

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  return sheetNameSync(sheetDeps()).POST(request, id);
}
