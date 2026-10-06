import { battleDeps } from "@/lib/combat/routeDeps";
import { noteItem } from "@/lib/combat/battleRoutes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/play/notes/[noteId]">;

export async function PUT(request: Request, context: Context) {
  const { noteId } = await context.params;
  return noteItem(battleDeps()).PUT(request, noteId);
}

export async function DELETE(request: Request, context: Context) {
  const { noteId } = await context.params;
  return noteItem(battleDeps()).DELETE(request, noteId);
}
