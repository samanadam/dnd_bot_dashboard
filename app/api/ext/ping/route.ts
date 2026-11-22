import { extDeps } from "@/lib/ext/routeDeps";
import { extPing } from "@/lib/ext/routes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return extPing(extDeps()).GET(request);
}
