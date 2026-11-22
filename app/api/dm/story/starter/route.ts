import { dmDeps } from "@/lib/dm/routeDeps";
import { storyStarter } from "@/lib/dm/storyRoutes";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return storyStarter(dmDeps()).POST(request);
}
