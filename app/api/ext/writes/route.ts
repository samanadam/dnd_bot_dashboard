import { extDeps } from "@/lib/ext/routeDeps";
import { extWrites } from "@/lib/ext/routes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return extWrites(extDeps()).GET(request);
}
