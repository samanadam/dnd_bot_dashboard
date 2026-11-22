import { extDeps } from "@/lib/ext/routeDeps";
import { extSync } from "@/lib/ext/routes";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return extSync(extDeps()).POST(request);
}
