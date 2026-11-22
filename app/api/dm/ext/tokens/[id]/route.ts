import { extTokenDeps } from "@/lib/ext/routeDeps";
import { extTokenItem } from "@/lib/ext/tokenRoutes";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return extTokenItem(extTokenDeps()).DELETE(request, id);
}
