import { areaCollection } from "@/lib/dm/areaRoutes";
import { dmDeps } from "@/lib/dm/routeDeps";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return areaCollection(dmDeps()).GET(request);
}

export async function POST(request: Request) {
  return areaCollection(dmDeps()).POST(request);
}
