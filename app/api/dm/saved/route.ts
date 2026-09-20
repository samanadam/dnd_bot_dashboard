import { dmDeps } from "@/lib/dm/routeDeps";
import { savedCollection } from "@/lib/dm/savedRoutes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return savedCollection(dmDeps()).GET(request);
}

export async function POST(request: Request) {
  return savedCollection(dmDeps()).POST(request);
}
