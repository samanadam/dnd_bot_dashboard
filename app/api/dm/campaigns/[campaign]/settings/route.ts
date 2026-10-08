import { battleDeps } from "@/lib/combat/routeDeps";
import { campaignSettings } from "@/lib/combat/battleRoutes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/dm/campaigns/[campaign]/settings">;

export async function GET(request: Request, context: Context) {
  const { campaign } = await context.params;
  return campaignSettings(battleDeps()).GET(request, campaign);
}

export async function PUT(request: Request, context: Context) {
  const { campaign } = await context.params;
  return campaignSettings(battleDeps()).PUT(request, campaign);
}
