import { battleDeps } from "@/lib/combat/routeDeps";
import { dmEncounterNotes } from "@/lib/combat/battleRoutes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/dm/encounters/[id]/notes">;

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return dmEncounterNotes(battleDeps()).GET(request, id);
}
