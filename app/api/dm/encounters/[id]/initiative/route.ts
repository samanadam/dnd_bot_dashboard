import { battleDeps } from "@/lib/combat/routeDeps";
import { dmBattleRolls } from "@/lib/combat/battleRoutes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/dm/encounters/[id]/initiative">;

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return dmBattleRolls(battleDeps()).GET(request, id);
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  return dmBattleRolls(battleDeps()).DELETE(request, id);
}
