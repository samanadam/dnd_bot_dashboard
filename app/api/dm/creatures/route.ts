import { creatureCollection } from "@/lib/dm/creatureRoutes";
import { dmDeps } from "@/lib/dm/routeDeps";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return creatureCollection(dmDeps()).GET(request);
}

export async function POST(request: Request) {
  return creatureCollection(dmDeps()).POST(request);
}
