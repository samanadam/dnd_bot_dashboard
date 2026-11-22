import { dmDeps } from "@/lib/dm/routeDeps";
import { storyCollection } from "@/lib/dm/storyRoutes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return storyCollection(dmDeps()).GET(request);
}

export async function POST(request: Request) {
  return storyCollection(dmDeps()).POST(request);
}
