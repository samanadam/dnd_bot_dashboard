import { totpDeps } from "@/lib/totp/routeDeps";
import { totpSelf } from "@/lib/totp/routes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return totpSelf(totpDeps()).GET(request);
}

export async function DELETE(request: Request) {
  return totpSelf(totpDeps()).DELETE(request);
}
