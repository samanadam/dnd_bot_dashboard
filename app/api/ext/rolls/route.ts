import { extDeps } from "@/lib/ext/routeDeps";
import { extRolls } from "@/lib/ext/routes";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return extRolls(extDeps()).POST(request);
}
