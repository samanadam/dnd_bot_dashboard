import { partyDeps } from "@/lib/party/routeDeps";
import { partyNotes } from "@/lib/party/routes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/play/party-notes/[id]">;

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  return partyNotes(partyDeps()).PUT(request, id);
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  return partyNotes(partyDeps()).DELETE(request, id);
}
