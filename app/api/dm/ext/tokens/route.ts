import { extTokenDeps } from "@/lib/ext/routeDeps";
import { extTokens } from "@/lib/ext/tokenRoutes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return extTokens(extTokenDeps()).GET(request);
}

export async function POST(request: Request) {
  return extTokens(extTokenDeps()).POST(request);
}
