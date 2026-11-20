import { totpDeps } from "@/lib/totp/routeDeps";
import { totpConfirm } from "@/lib/totp/routes";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return totpConfirm(totpDeps()).POST(request);
}
