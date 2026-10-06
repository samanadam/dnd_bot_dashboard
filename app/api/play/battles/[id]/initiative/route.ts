import { battleDeps } from "@/lib/combat/routeDeps";
import { battleInitiative } from "@/lib/combat/battleRoutes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/play/battles/[id]/initiative">;

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  return battleInitiative(battleDeps()).POST(request, id);
}
