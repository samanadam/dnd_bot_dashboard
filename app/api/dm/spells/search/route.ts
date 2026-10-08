import { dmDeps } from "@/lib/dm/routeDeps";
import { spellSearch } from "@/lib/dm/spellRoutes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return spellSearch(dmDeps()).GET(request);
}
