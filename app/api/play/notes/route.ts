import { battleDeps } from "@/lib/combat/routeDeps";
import { keptNotes } from "@/lib/combat/battleRoutes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return keptNotes(battleDeps()).GET(request);
}
