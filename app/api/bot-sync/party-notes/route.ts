import { partyDeps } from "@/lib/party/routeDeps";
import { partyNotesSync } from "@/lib/party/routes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return partyNotesSync(partyDeps()).GET(request);
}

export async function POST(request: Request) {
  return partyNotesSync(partyDeps()).POST(request);
}
