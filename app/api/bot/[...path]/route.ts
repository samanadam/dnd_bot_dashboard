import { auth } from "@/auth";
import { audit } from "@/lib/audit";
import { handleBotRequest } from "@/lib/bot/proxy";
import { handleBotUpload, isUploadPath } from "@/lib/bot/upload";
import { isDm } from "@/lib/dm/isDm";
import { env } from "@/lib/env";

// The ONLY place BOT_API_TOKEN is read. See lib/bot/proxy.ts for the pipeline.

export const dynamic = "force-dynamic";

async function handle(request: Request, context: RouteContext<"/api/bot/[...path]">) {
  const { path } = await context.params;
  const config = env();
  const deps = {
    getUserId: async () => (await auth())?.user?.id || null,
    botUrl: config.BOT_API_URL,
    botToken: config.BOT_API_TOKEN,
    log: audit,
    isDm: (userId: string) => isDm(userId, config.DM_USER_IDS),
  };
  // File uploads stream through their own pipeline (lib/bot/upload.ts).
  if (isUploadPath(request.method.toUpperCase(), path)) return handleBotUpload(request, deps);
  return handleBotRequest(request, path, deps);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
