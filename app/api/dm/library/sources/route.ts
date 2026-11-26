import { librarySources } from "@/lib/dm/libraryRoutes";
import { dmDeps } from "@/lib/dm/routeDeps";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return librarySources(dmDeps()).GET(request);
}
