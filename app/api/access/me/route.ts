import { accessDeps } from "@/lib/access/routeDeps";
import { accessMe } from "@/lib/access/routes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return accessMe(accessDeps()).GET(request);
}
