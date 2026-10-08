import { dmDeps } from "@/lib/dm/routeDeps";
import { featCollection } from "@/lib/dm/spellRoutes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return featCollection(dmDeps()).GET(request);
}

export async function POST(request: Request) {
  return featCollection(dmDeps()).POST(request);
}
