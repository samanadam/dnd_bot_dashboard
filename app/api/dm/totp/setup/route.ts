import { totpDeps } from "@/lib/totp/routeDeps";
import { totpSetup } from "@/lib/totp/routes";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return totpSetup(totpDeps()).POST(request);
}
