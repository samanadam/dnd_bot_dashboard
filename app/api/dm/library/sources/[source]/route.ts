import { librarySource } from "@/lib/dm/libraryRoutes";
import { dmDeps } from "@/lib/dm/routeDeps";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: RouteContext<"/api/dm/library/sources/[source]">) {
  return librarySource(dmDeps()).DELETE(request, decodeURIComponent((await context.params).source));
}
