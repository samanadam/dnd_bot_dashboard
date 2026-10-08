import { dmDeps } from "@/lib/dm/routeDeps";
import { srdSpell } from "@/lib/dm/spellRoutes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/dm/spells/srd/[edition]/[slug]">;

export async function GET(request: Request, context: Context) {
  const { edition, slug } = await context.params;
  return srdSpell(dmDeps()).GET(request, edition, slug);
}
