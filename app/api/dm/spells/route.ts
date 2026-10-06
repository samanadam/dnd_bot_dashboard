import { dmDeps } from "@/lib/dm/routeDeps";
import { spellCollection } from "@/lib/dm/spellRoutes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return spellCollection(dmDeps()).GET(request);
}

export async function POST(request: Request) {
  return spellCollection(dmDeps()).POST(request);
}
