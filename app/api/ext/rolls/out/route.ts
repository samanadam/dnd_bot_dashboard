import { extDeps } from "@/lib/ext/routeDeps";
import { extRollsOut } from "@/lib/ext/routes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return extRollsOut(extDeps()).GET(request);
}
