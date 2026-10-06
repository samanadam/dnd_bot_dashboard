import { dmDeps } from "@/lib/dm/routeDeps";
import { srdFeat } from "@/lib/dm/spellRoutes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/dm/feats/srd/[edition]/[slug]">;

export async function GET(request: Request, context: Context) {
  const { edition, slug } = await context.params;
  return srdFeat(dmDeps()).GET(request, edition, slug);
}
