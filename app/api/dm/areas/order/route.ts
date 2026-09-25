import { areaOrder } from "@/lib/dm/areaRoutes";
import { dmDeps } from "@/lib/dm/routeDeps";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  return areaOrder(dmDeps()).PUT(request);
}
