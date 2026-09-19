import { dmDeps } from "@/lib/dm/routeDeps";
import { sceneCollection } from "@/lib/dm/sceneRoutes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return sceneCollection(dmDeps()).GET(request);
}

export async function POST(request: Request) {
  return sceneCollection(dmDeps()).POST(request);
}
