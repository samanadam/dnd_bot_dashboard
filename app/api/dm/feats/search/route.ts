import { dmDeps } from "@/lib/dm/routeDeps";
import { featSearch } from "@/lib/dm/spellRoutes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return featSearch(dmDeps()).GET(request);
}
