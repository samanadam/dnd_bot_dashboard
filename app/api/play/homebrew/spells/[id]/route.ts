import { homebrewDeps } from "@/lib/play/routeDeps";
import { homebrewItem } from "@/lib/play/homebrewRoutes";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/play/homebrew/spells/[id]">;

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return homebrewItem(homebrewDeps(), "spells").GET(request, id);
}

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  return homebrewItem(homebrewDeps(), "spells").PUT(request, id);
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  return homebrewItem(homebrewDeps(), "spells").DELETE(request, id);
}
