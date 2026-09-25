import { itemCollection } from "@/lib/dm/itemRoutes";
import { dmDeps } from "@/lib/dm/routeDeps";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return itemCollection(dmDeps()).GET(request);
}

export async function POST(request: Request) {
  return itemCollection(dmDeps()).POST(request);
}
