import { sheetDeps } from "@/lib/sheets/routeDeps";
import { sheetVitals } from "@/lib/sheets/routes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/sheets/[id]/vitals">;

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return sheetVitals(sheetDeps()).GET(request, id);
}
