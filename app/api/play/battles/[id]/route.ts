import { battleDeps } from "@/lib/combat/routeDeps";
import { battleItem } from "@/lib/combat/battleRoutes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/play/battles/[id]">;

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return battleItem(battleDeps()).GET(request, id);
}
