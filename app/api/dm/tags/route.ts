import { dmDeps } from "@/lib/dm/routeDeps";
import { tagRoutes } from "@/lib/dm/tagRoutes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return tagRoutes(dmDeps()).GET(request);
}

export async function PUT(request: Request) {
  return tagRoutes(dmDeps()).PUT(request);
}
