import { partyDeps } from "@/lib/party/routeDeps";
import { partyNotes } from "@/lib/party/routes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return partyNotes(partyDeps()).GET(request);
}

export async function POST(request: Request) {
  return partyNotes(partyDeps()).POST(request);
}
