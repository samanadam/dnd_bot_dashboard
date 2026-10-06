import { allowsFor } from "@/lib/access/permissions";
import { getAccess } from "@/lib/access/server";
import { audit } from "@/lib/audit";
import { handleBotRequest } from "@/lib/bot/proxy";
import { handleBotUpload, isUploadPath } from "@/lib/bot/upload";
import { env } from "@/lib/env";

// The browser's one way to the bot. See lib/bot/proxy.ts for the pipeline. The
// token is read here and in lib/bot/server.ts (calls the server makes itself).

export const dynamic = "force-dynamic";

async function handle(request: Request, context: RouteContext<"/api/bot/[...path]">) {
  const { path } = await context.params;
  const config = env();
  const access = await getAccess();
  const deps = {
    getUserId: async () => access?.userId || null,
    botUrl: config.BOT_API_URL,
    botToken: config.BOT_API_TOKEN,
    log: audit,
    allows: allowsFor(access),
  };
  // File uploads stream through their own pipeline (lib/bot/upload.ts).
  if (isUploadPath(request.method.toUpperCase(), path)) return handleBotUpload(request, deps);
  return handleBotRequest(request, path, deps);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
