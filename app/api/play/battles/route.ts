import { battleDeps } from "@/lib/combat/routeDeps";
import { battleList } from "@/lib/combat/battleRoutes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return battleList(battleDeps()).GET(request);
}
