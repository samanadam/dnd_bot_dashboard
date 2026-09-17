import { encounterCollection } from "@/lib/dm/encounterRoutes";
import { dmDeps } from "@/lib/dm/routeDeps";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return encounterCollection(dmDeps()).GET(request);
}

export async function POST(request: Request) {
  return encounterCollection(dmDeps()).POST(request);
}
