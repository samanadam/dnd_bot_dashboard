import { creatureSearch } from "@/lib/dm/creatureSearch";
import { dmDeps } from "@/lib/dm/routeDeps";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return creatureSearch(dmDeps()).GET(request);
}
