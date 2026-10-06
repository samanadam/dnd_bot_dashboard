import { sheetDeps } from "@/lib/sheets/routeDeps";
import { sheetFeatSearch } from "@/lib/sheets/routes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/sheets/[id]/feats/search">;

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return sheetFeatSearch(sheetDeps()).GET(request, id);
}
