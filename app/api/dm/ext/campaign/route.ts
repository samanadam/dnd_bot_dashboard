import { extTokenDeps } from "@/lib/ext/routeDeps";
import { extCampaignChoice } from "@/lib/ext/tokenRoutes";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  return extCampaignChoice(extTokenDeps()).PUT(request);
}
