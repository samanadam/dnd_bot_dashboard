import { totpDeps } from "@/lib/totp/routeDeps";
import { totpAdmin } from "@/lib/totp/routes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return totpAdmin(totpDeps()).GET(request);
}

export async function DELETE(request: Request) {
  return totpAdmin(totpDeps()).DELETE(request);
}
