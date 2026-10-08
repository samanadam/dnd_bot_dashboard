import { accessDeps } from "@/lib/access/routeDeps";
import { grantCollection } from "@/lib/access/routes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return grantCollection(accessDeps()).GET(request);
}
