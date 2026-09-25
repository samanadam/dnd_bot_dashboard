import { srdItem } from "@/lib/dm/itemRoutes";
import { dmDeps } from "@/lib/dm/routeDeps";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/dm/items/srd/[edition]/[slug]">;

export async function GET(request: Request, context: Context) {
  const { edition, slug } = await context.params;
  return srdItem(dmDeps()).GET(request, edition, slug);
}
