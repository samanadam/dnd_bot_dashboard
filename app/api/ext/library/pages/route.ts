import { extDeps } from "@/lib/ext/routeDeps";
import { extLibraryPages } from "@/lib/ext/routes";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return extLibraryPages(extDeps()).POST(request);
}
