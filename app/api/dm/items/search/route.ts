import { itemSearch } from "@/lib/dm/itemRoutes";
import { dmDeps } from "@/lib/dm/routeDeps";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return itemSearch(dmDeps()).GET(request);
}
