import { partyDeps } from "@/lib/party/routeDeps";
import { partyNotesChannel } from "@/lib/party/routes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/dm/campaigns/[campaign]/notes-channel">;

export async function GET(request: Request, context: Context) {
  const { campaign } = await context.params;
  return partyNotesChannel(partyDeps()).GET(request, campaign);
}

export async function PUT(request: Request, context: Context) {
  const { campaign } = await context.params;
  return partyNotesChannel(partyDeps()).PUT(request, campaign);
}
