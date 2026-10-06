import { sheetDeps } from "@/lib/sheets/routeDeps";
import { sheetSpellSearch } from "@/lib/sheets/routes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/sheets/[id]/spells/search">;

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return sheetSpellSearch(sheetDeps()).GET(request, id);
}
