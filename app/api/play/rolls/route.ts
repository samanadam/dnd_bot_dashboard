import { tableRollFeed } from "@/lib/play/rollRoutes";
import { rollFeedDeps } from "@/lib/play/routeDeps";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return tableRollFeed(rollFeedDeps()).GET(request);
}
