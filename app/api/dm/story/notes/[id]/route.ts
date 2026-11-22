import { dmDeps } from "@/lib/dm/routeDeps";
import { storyItem } from "@/lib/dm/storyRoutes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/dm/story/notes/[id]">;

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return storyItem(dmDeps()).GET(request, id);
}

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  return storyItem(dmDeps()).PUT(request, id);
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  return storyItem(dmDeps()).DELETE(request, id);
}
