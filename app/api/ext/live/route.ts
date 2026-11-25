import { extDeps } from "@/lib/ext/routeDeps";
import { extLive } from "@/lib/ext/routes";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  return extLive(extDeps()).PUT(request);
}
