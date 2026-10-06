import { battleDeps } from "@/lib/combat/routeDeps";
import { battleNotes } from "@/lib/combat/battleRoutes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/play/battles/[id]/notes">;

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return battleNotes(battleDeps()).GET(request, id);
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  return battleNotes(battleDeps()).POST(request, id);
}
