import { extDeps } from "@/lib/ext/routeDeps";
import { extSheetLocation } from "@/lib/ext/routes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return extSheetLocation(extDeps()).GET(request);
}
